"""Génération et résolution des numéros de compte tiers (401 / 411)."""
import re

from .models import ClientComptable, Fournisseur


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


def get_or_create_fournisseur(entreprise, nom: str) -> Fournisseur:
    """Retourne le fournisseur existant (par nom) ou crée un nouveau compte 401."""
    clean = (nom or "").strip()
    if not clean:
        clean = "Fournisseur inconnu"
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
    """Retourne le client comptable existant (par nom) ou crée un nouveau compte 411."""
    clean = (nom or "").strip()
    if not clean:
        clean = "Client inconnu"
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
