"""Génération et résolution des comptes tiers et sous-comptes SCF."""
import re
from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError
from django.db import transaction
from .models import ClientComptable, EntrepriseProduct, Fournisseur, SCFAccount, Entreprise


def _normalize_name(name: str) -> str:
    return re.sub(r"\s+", " ", (name or "").strip().lower())


def _collect_suffixes(entreprise, prefix: str) -> list[int]:
    """Collecte les suffixes déjà attribués pour un préfixe (401 ou 411).

    IMPORTANT : on ne compte QUE le registre des tiers (Fournisseur pour 401,
    ClientComptable pour 411) — jamais les lignes d'écritures, sinon les
    comptes génériques (401000, 4011…) présents dans les écritures polluent
    la séquence et le premier fournisseur ne reçoit pas 401001."""
    model = Fournisseur if prefix == "401" else ClientComptable
    pat = re.compile(rf"^{prefix}(\d+)$")
    suffixes: list[int] = []
    for num in model.objects.filter(entreprise=entreprise).values_list(
        "numero_compte", flat=True
    ):
        m = pat.match(str(num))
        if m:
            suffixes.append(int(m.group(1)))
    return suffixes


def next_account_number(entreprise, prefix: str) -> str:
    """Génère le prochain numéro de compte unique commençant par `prefix` (401 ou 411)."""
    suffixes = _collect_suffixes(entreprise, prefix)
    next_suffix = (max(suffixes) + 1) if suffixes else 1
    if next_suffix > 999:
        raise ValueError(f"Limite de comptes {prefix} atteinte pour cette entreprise.")
    return f"{prefix}{next_suffix:03d}"


PRODUCT_CATEGORIES = (
    ("marchandise", EntrepriseProduct.Category.MARCHANDISE, "380"),
    ("matiere_premiere", EntrepriseProduct.Category.MATIERE_PREMIERE, "381"),
    ("matieres_consommables", EntrepriseProduct.Category.MATIERES_CONSOMMABLES, "382"),
)


def _product_names(value: str) -> list[str]:
    return [name.strip() for name in (value or "").splitlines() if name.strip()]


def _renumber_product_category(entreprise, category: str, prefix: str) -> None:
    products = list(
        EntrepriseProduct.objects.select_for_update()
        .filter(entreprise=entreprise, category=category, is_active=True)
        .order_by("created_at", "id")
    )
    if not products:
        return

    general_number = f"{prefix}000"
    if len(products) == 1:
        products[0].numero_compte = general_number
        products[0].save(update_fields=["numero_compte"])
    else:
        reserved = set()
        historical_numbers = list(
            EntrepriseProduct.objects.filter(
                entreprise=entreprise, category=category
            ).values_list("numero_compte", flat=True)
        )
        existing_numbers = SCFAccount.objects.filter(
            entreprise=entreprise, numero_compte__startswith=prefix
        ).values_list("numero_compte", flat=True)
        for number in list(historical_numbers) + list(existing_numbers):
            match = re.fullmatch(rf"{re.escape(prefix)}(\d{{3}})", str(number))
            if match and int(match.group(1)) > 0:
                reserved.add(int(match.group(1)))

        used = set()
        for product in products:
            match = re.fullmatch(
                rf"{re.escape(prefix)}(\d{{3}})", product.numero_compte or ""
            )
            if match and int(match.group(1)) > 0:
                used.add(int(match.group(1)))

        for product in products:
            if product.numero_compte != general_number and product.numero_compte:
                continue
            next_suffix = max(reserved | used, default=0) + 1
            if next_suffix > 999:
                raise ValueError(f"Limite de comptes {prefix} atteinte pour cette entreprise.")
            product.numero_compte = f"{prefix}{next_suffix:03d}"
            product.save(update_fields=["numero_compte"])
            used.add(next_suffix)
            reserved.add(next_suffix)

    for product in products:
        SCFAccount.objects.update_or_create(
            entreprise=entreprise,
            numero_compte=product.numero_compte,
            defaults={
                "libelle": product.nom[:255],
                "classe": 3,
            },
        )


@transaction.atomic
def synchronize_entreprise_products(entreprise) -> None:
    """Synchronize the three legacy text fields with durable product records."""
    entreprise = Entreprise.objects.select_for_update().get(pk=entreprise.pk)
    for field, category, prefix in PRODUCT_CATEGORIES:
        names = _product_names(getattr(entreprise, field))
        normalized_names = [_normalize_name(name) for name in names]
        if len(set(normalized_names)) != len(normalized_names):
            raise ValidationError(
                {field: "Chaque produit doit avoir un nom unique dans sa catégorie."}
            )

        existing = list(
            EntrepriseProduct.objects.select_for_update().filter(
                entreprise=entreprise, category=category, is_active=True
            )
        )
        existing_by_name = {_normalize_name(product.nom): product for product in existing}
        wanted = set(normalized_names)
        for product in existing:
            if _normalize_name(product.nom) not in wanted:
                product.is_active = False
                product.save(update_fields=["is_active"])

        for name, normalized_name in zip(names, normalized_names):
            if normalized_name not in existing_by_name:
                EntrepriseProduct.objects.create(
                    entreprise=entreprise,
                    category=category,
                    nom=name,
                )

        _renumber_product_category(entreprise, category, prefix)


@transaction.atomic
def apply_product_accounts(entreprise, lignes: list) -> list:
    """Apply explicitly selected company products to purchase accounting lines."""
    Entreprise.objects.select_for_update().get(pk=entreprise.pk)
    out = []
    for raw_line in lignes:
        line = dict(raw_line)
        product_id = line.get("product_id")
        if product_id in (None, ""):
            out.append(line)
            continue
        if isinstance(product_id, bool) or not re.fullmatch(r"\d+", str(product_id)):
            raise ValidationError("Le produit sélectionné est invalide.")
        try:
            product_id = int(product_id)
        except (TypeError, ValueError):
            raise ValidationError("Le produit sélectionné est invalide.")
        product = EntrepriseProduct.objects.select_for_update().filter(
            pk=product_id, entreprise=entreprise, is_active=True
        ).first()
        if not product:
            raise ValidationError("Le produit sélectionné n'appartient pas à cette entreprise.")
        if not product.numero_compte:
            raise ValidationError("Le produit sélectionné n'a pas de compte SCF attribué.")
        try:
            debit = Decimal(str(line.get("debit") or 0))
            credit = Decimal(str(line.get("credit") or 0))
        except (InvalidOperation, TypeError, ValueError) as exc:
            raise ValidationError("Le montant de la ligne produit est invalide.") from exc
        if debit <= 0 or credit != 0:
            raise ValidationError(
                "Un produit doit être associé à une ligne d'achat au débit."
            )
        line["compte"] = product.numero_compte
        out.append(line)
    return out


def _validate_not_self(entreprise, nom: str, type_tiers: str):
    """Vérifie que le tiers n'est pas l'entreprise elle-même.
    
    En comptabilité, une entreprise ne peut pas être son propre client ou fournisseur.
    Si le nom correspond, on lève une erreur claire.
    """
    clean_nom = _normalize_name(nom)
    clean_entreprise = _normalize_name(entreprise.nom)
    
    if clean_nom == clean_entreprise:
        raise ValidationError(
            f"Impossible d'ajouter l'entreprise elle-même comme {type_tiers}. "
            f"Veuillez vérifier le nom du tiers sur la facture."
        )


def get_or_create_fournisseur(entreprise, nom: str) -> Fournisseur:
    """Retourne le fournisseur existant (par nom) ou crée un nouveau compte 401.
    
    IMPORTANT : L'entreprise ne peut pas être son propre fournisseur.
    Si le nom correspond à celui de l'entreprise, une erreur est levée.
    """
    clean = (nom or "").strip()
    if not clean:
        raise ValidationError("Le nom du fournisseur est obligatoire.")
    
    # Vérification : l'entreprise ne peut pas être son propre fournisseur
    _validate_not_self(entreprise, clean, "fournisseur")
    
    norm = _normalize_name(clean)
    for f in Fournisseur.objects.filter(entreprise=entreprise):
        if _normalize_name(f.nom) == norm:
            return f
    return Fournisseur.objects.create(
        entreprise=entreprise,
        nom=clean,
        numero_compte=next_account_number(entreprise, "401"),
    )


def get_or_create_client_comptable(entreprise, nom: str) -> ClientComptable:
    """Retourne le client comptable existant (par nom) ou crée un nouveau compte 411.
    
    IMPORTANT : L'entreprise ne peut pas être son propre client.
    Si le nom correspond à celui de l'entreprise, une erreur est levée.
    """
    clean = (nom or "").strip()
    if not clean:
        raise ValidationError("Le nom du client est obligatoire.")
    
    # Vérification : l'entreprise ne peut pas être son propre client
    _validate_not_self(entreprise, clean, "client")
    
    norm = _normalize_name(clean)
    for c in ClientComptable.objects.filter(entreprise=entreprise):
        if _normalize_name(c.nom) == norm:
            return c
    return ClientComptable.objects.create(
        entreprise=entreprise,
        nom=clean,
        numero_compte=next_account_number(entreprise, "411"),
    )


def apply_tiers_account(lignes: list, account_num: str, prefix: str) -> list:
    """Remplace les comptes génériques (401, 401000, 4011, 411, …) par le compte tiers."""
    out = []
    for ligne in lignes:
        ligne = dict(ligne)
        compte = str(ligne.get("compte", "") or "")
        if compte.startswith(prefix) or compte in (prefix, f"{prefix}000", f"{prefix}1"):
            ligne["compte"] = account_num
        out.append(ligne)
    return out


def auto_balance_lines(lignes: list, is_vente: bool) -> list:
    """S'assure que le total des débits est exactement égal au total des crédits.
    S'il existe une différence (ex: timbre fiscal, frais annexes, remises),
    ajoute automatiquement la ligne d'équilibrage correspondante."""
    if not lignes:
        return []
    out = [dict(l) for l in lignes]
    total_debit = round(sum(float(l.get("debit", 0) or 0) for l in out), 2)
    total_credit = round(sum(float(l.get("credit", 0) or 0) for l in out), 2)
    diff = round(total_debit - total_credit, 2)

    if abs(diff) <= 0.01:
        return out

    if diff > 0:
        # Total Débit > Total Crédit (manque de crédit)
        if is_vente:
            # Pour une vente : droits de timbre / frais annexes (compte 445800)
            out.append({
                "compte": "445800",
                "libelle": "Droits de timbre / Frais annexes",
                "debit": 0,
                "credit": diff,
            })
        else:
            # Pour un achat : escompte / régularisation
            out.append({
                "compte": "609000",
                "libelle": "Rabais, remises et ristournes / Régularisation",
                "debit": 0,
                "credit": diff,
            })
    else:
        # Total Crédit > Total Débit (manque de débit)
        missing_debit = abs(diff)
        if is_vente:
            out.append({
                "compte": "709000",
                "libelle": "Rabais, remises et ristournes accordés",
                "debit": missing_debit,
                "credit": 0,
            })
        else:
            # Pour un achat : droits de timbre / frais généraux (compte 645800)
            out.append({
                "compte": "645800",
                "libelle": "Droits de timbre / Frais annexes",
                "debit": missing_debit,
                "credit": 0,
            })

    return out


SCF_SUBACCOUNT_PREFIXES = ("380", "381", "382", "355", "512")


def _is_generic_scf_account(numero: str, prefix: str) -> bool:
    """Recognize a master account (or its usual zero/one suffix aliases)."""
    return numero in (prefix, f"{prefix}000", f"{prefix}1")


def _bank_for_line(entreprise, label: str):
    """Choose the configured bank named by the line, otherwise the first one."""
    clean_label = _normalize_name(label)
    for banque in (entreprise.banque, entreprise.banque2):
        if banque and _normalize_name(banque) in clean_label:
            return banque
    return entreprise.banque or entreprise.banque2


def enterprise_bank_subaccount(entreprise, label: str = "") -> str:
    """Return the named 512 subaccount for the bank identified by a label."""
    return get_or_create_scf_subaccount(entreprise, "512", label)


@transaction.atomic
def get_or_create_scf_subaccount(entreprise, prefix: str, libelle: str) -> str:
    """Return an enterprise-specific SCF subaccount, reusing it by label.

    The global master account must exist first, keeping generated accounts
    synchronized with the imported SCF chart. Number allocation is locked per
    enterprise transaction so two confirmations cannot receive the same suffix.
    """
    prefix = str(prefix).strip()
    entreprise.__class__.objects.select_for_update().get(pk=entreprise.pk)
    if prefix not in SCF_SUBACCOUNT_PREFIXES:
        raise ValueError(f"Préfixe SCF non pris en charge: {prefix}")
    if not SCFAccount.objects.filter(entreprise__isnull=True, numero_compte=prefix).exists():
        raise ValidationError(f"Le compte {prefix} n'existe pas dans le plan comptable SCF.")

    label = (libelle or "").strip()
    if prefix == "512":
        banque = _bank_for_line(entreprise, label)
        if not banque:
            raise ValidationError("Aucune banque n'est enregistrée pour cette entreprise.")
        label = f"BANQUE {banque}"

    normalized_label = _normalize_name(label)
    existing = SCFAccount.objects.filter(entreprise=entreprise, numero_compte__startswith=prefix)
    for account in existing:
        if _normalize_name(account.libelle) == normalized_label:
            return account.numero_compte

    allocated = list(
        SCFAccount.objects.select_for_update()
        .filter(entreprise=entreprise, numero_compte__startswith=prefix)
        .values_list("numero_compte", flat=True)
    )
    suffixes = [
        int(match.group(1))
        for number in allocated
        if (match := re.fullmatch(rf"{re.escape(prefix)}(\d{{3}})", str(number)))
    ]
    next_suffix = max(suffixes, default=0) + 1
    if next_suffix > 999:
        raise ValueError(f"Limite de comptes {prefix} atteinte pour cette entreprise.")
    account = SCFAccount.objects.create(
        entreprise=entreprise,
        numero_compte=f"{prefix}{next_suffix:03d}",
        libelle=label,
        classe=int(prefix[0]),
    )
    return account.numero_compte


def apply_scf_subaccounts(entreprise, lignes: list) -> list:
    """Replace generic 380/381/382/355/512 lines with named subaccounts."""
    out = []
    for raw_line in lignes:
        line = dict(raw_line)
        numero = str(line.get("compte", "") or "").strip()
        prefix = next(
            (candidate for candidate in SCF_SUBACCOUNT_PREFIXES
             if numero.startswith(candidate)),
            None,
        )
        if prefix and _is_generic_scf_account(numero, prefix):
            line["compte"] = get_or_create_scf_subaccount(
                entreprise, prefix, line.get("libelle", "")
            )
        elif prefix == "512" and numero in {"512001", "512002"}:
            bank = entreprise.banque if numero == "512001" else entreprise.banque2
            if bank:
                SCFAccount.objects.update_or_create(
                    entreprise=entreprise,
                    numero_compte=numero,
                    defaults={"libelle": f"BANQUE {bank}", "classe": 5},
                )
        out.append(line)
    return out