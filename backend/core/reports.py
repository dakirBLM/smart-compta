"""Accounting report builders: balance, compte de résultat, grand livre, dashboard.

All figures are derived from validated journal entries (LigneEcriture rows).
Account classes follow the French/Algerian PCN: the first digit of the
account number determines the class (1..7).
"""
from collections import defaultdict
from datetime import date
from decimal import Decimal

from .models import Ecriture, LigneEcriture

# Standard account-class labels (Plan Comptable National).
CLASSE_LABELS = {
    "1": "Comptes de capitaux",
    "2": "Comptes d'immobilisations",
    "3": "Comptes de stocks",
    "4": "Comptes de tiers",
    "5": "Comptes financiers",
    "6": "Comptes de charges",
    "7": "Comptes de produits",
}


def _lignes_qs(entreprise, annee=None, start=None, end=None, only_valid=False):
    qs = LigneEcriture.objects.filter(
        ecriture__journal__entreprise=entreprise
    ).select_related("ecriture", "ecriture__journal", "ecriture__journal__annee")
    if annee is not None:
        qs = qs.filter(ecriture__journal__annee__annee=annee)
    if start:
        qs = qs.filter(ecriture__date_ecriture__gte=start)
    if end:
        qs = qs.filter(ecriture__date_ecriture__lte=end)
    if only_valid:
        qs = qs.filter(ecriture__statut=Ecriture.Statut.VALIDE)
    return qs


def _d(value):
    return Decimal(value or 0)


def build_balance(entreprise, annee=None):
    """Returns rows grouped by account, with class grouping and totals."""
    qs = _lignes_qs(entreprise, annee)
    accounts = {}
    for ligne in qs:
        acc = accounts.setdefault(
            ligne.numero_compte,
            {"compte": ligne.numero_compte, "libelle": ligne.libelle,
             "debit": Decimal(0), "credit": Decimal(0)},
        )
        acc["debit"] += _d(ligne.montant_debit)
        acc["credit"] += _d(ligne.montant_credit)
        if ligne.libelle and not acc["libelle"]:
            acc["libelle"] = ligne.libelle

    rows = []
    for acc in accounts.values():
        solde = acc["debit"] - acc["credit"]
        acc["solde_debiteur"] = solde if solde > 0 else Decimal(0)
        acc["solde_crediteur"] = -solde if solde < 0 else Decimal(0)
        acc["classe"] = acc["compte"][:1] if acc["compte"] else "?"
        rows.append(acc)
    rows.sort(key=lambda r: r["compte"])

    classes = defaultdict(lambda: {"debit": Decimal(0), "credit": Decimal(0),
                                   "solde_debiteur": Decimal(0),
                                   "solde_crediteur": Decimal(0), "comptes": []})
    for r in rows:
        c = classes[r["classe"]]
        c["debit"] += r["debit"]
        c["credit"] += r["credit"]
        c["solde_debiteur"] += r["solde_debiteur"]
        c["solde_crediteur"] += r["solde_crediteur"]
        c["comptes"].append(r)

    grouped = []
    for classe in sorted(classes.keys()):
        data = classes[classe]
        grouped.append({
            "classe": classe,
            "label": CLASSE_LABELS.get(classe, "Autre"),
            "comptes": _to_float_rows(data["comptes"]),
            "total_debit": float(data["debit"]),
            "total_credit": float(data["credit"]),
            "total_solde_debiteur": float(data["solde_debiteur"]),
            "total_solde_crediteur": float(data["solde_crediteur"]),
        })

    totals = {
        "debit": float(sum(r["debit"] for r in rows)),
        "credit": float(sum(r["credit"] for r in rows)),
        "solde_debiteur": float(sum(r["solde_debiteur"] for r in rows)),
        "solde_crediteur": float(sum(r["solde_crediteur"] for r in rows)),
    }
    return {"classes": grouped, "totals": totals}


def _to_float_rows(rows):
    out = []
    for r in rows:
        out.append({
            "compte": r["compte"],
            "libelle": r["libelle"],
            "classe": r["classe"],
            "debit": float(r["debit"]),
            "credit": float(r["credit"]),
            "solde_debiteur": float(r["solde_debiteur"]),
            "solde_crediteur": float(r["solde_crediteur"]),
        })
    return out


def build_compte_resultat(entreprise, annee=None):
    """Charges (class 6) vs Produits (class 7), split by nature.

    Heuristic split by sub-account ranges:
      - 66x charges financières / 76x produits financiers
      - 67x charges exceptionnelles / 77x produits exceptionnels
      - 695/698 impôts sur les bénéfices
      - everything else under 6/7 is exploitation
    """
    qs = _lignes_qs(entreprise, annee)
    charges = {"exploitation": Decimal(0), "financieres": Decimal(0),
               "exceptionnelles": Decimal(0), "impots": Decimal(0)}
    produits = {"exploitation": Decimal(0), "financiers": Decimal(0),
                "exceptionnels": Decimal(0)}
    detail_charges, detail_produits = defaultdict(Decimal), defaultdict(Decimal)

    for ligne in qs:
        compte = ligne.numero_compte
        if compte.startswith("6"):
            montant = _d(ligne.montant_debit) - _d(ligne.montant_credit)
            detail_charges[compte] += montant
            if compte.startswith("66"):
                charges["financieres"] += montant
            elif compte.startswith("67"):
                charges["exceptionnelles"] += montant
            elif compte.startswith("69"):
                charges["impots"] += montant
            else:
                charges["exploitation"] += montant
        elif compte.startswith("7"):
            montant = _d(ligne.montant_credit) - _d(ligne.montant_debit)
            detail_produits[compte] += montant
            if compte.startswith("76"):
                produits["financiers"] += montant
            elif compte.startswith("77"):
                produits["exceptionnels"] += montant
            else:
                produits["exploitation"] += montant

    total_charges = sum(charges.values())
    total_produits = sum(produits.values())
    resultat = total_produits - total_charges

    return {
        "charges": {k: float(v) for k, v in charges.items()},
        "produits": {k: float(v) for k, v in produits.items()},
        "detail_charges": {k: float(v) for k, v in sorted(detail_charges.items())},
        "detail_produits": {k: float(v) for k, v in sorted(detail_produits.items())},
        "total_charges": float(total_charges),
        "total_produits": float(total_produits),
        "resultat": float(resultat),
        "is_benefice": resultat >= 0,
    }


def build_grand_livre(entreprise, annee=None, start=None, end=None):
    """Per-account ledger with a running balance, sorted by date."""
    qs = _lignes_qs(entreprise, annee, start, end).order_by(
        "numero_compte", "ecriture__date_ecriture", "ecriture__id"
    )
    comptes = defaultdict(lambda: {"libelle": "", "lignes": []})
    for ligne in qs:
        comptes[ligne.numero_compte]["lignes"].append(ligne)
        if ligne.libelle and not comptes[ligne.numero_compte]["libelle"]:
            comptes[ligne.numero_compte]["libelle"] = ligne.libelle

    result = []
    for compte in sorted(comptes.keys()):
        solde = Decimal(0)
        mouvements = []
        for ligne in comptes[compte]["lignes"]:
            solde += _d(ligne.montant_debit) - _d(ligne.montant_credit)
            mouvements.append({
                "date": ligne.ecriture.date_ecriture.isoformat(),
                "libelle": ligne.libelle or ligne.ecriture.fournisseur_client,
                "numero_piece": ligne.ecriture.numero_piece,
                "debit": float(_d(ligne.montant_debit)),
                "credit": float(_d(ligne.montant_credit)),
                "solde": float(solde),
            })
        result.append({
            "compte": compte,
            "libelle": comptes[compte]["libelle"],
            "mouvements": mouvements,
            "solde_final": float(solde),
        })
    return {"comptes": result}


def build_dashboard(entreprise, annee=None):
    """KPI cards, monthly result evolution, and charges breakdown."""
    qs = _lignes_qs(entreprise, annee)

    chiffre_affaires = Decimal(0)   # class 7 (produits)
    achats = Decimal(0)             # class 60
    charges = Decimal(0)            # class 6 total
    monthly = defaultdict(lambda: {"produits": Decimal(0), "charges": Decimal(0)})
    repartition = {"Achats": Decimal(0), "Services": Decimal(0),
                   "Salaires": Decimal(0), "Autres": Decimal(0)}

    for ligne in qs:
        compte = ligne.numero_compte
        month = ligne.ecriture.date_ecriture.strftime("%Y-%m")
        debit, credit = _d(ligne.montant_debit), _d(ligne.montant_credit)
        if compte.startswith("7"):
            val = credit - debit
            chiffre_affaires += val
            monthly[month]["produits"] += val
        elif compte.startswith("6"):
            val = debit - credit
            charges += val
            monthly[month]["charges"] += val
            if compte.startswith("60"):
                achats += val
                repartition["Achats"] += val
            elif compte.startswith("61") or compte.startswith("62"):
                repartition["Services"] += val
            elif compte.startswith("63") or compte.startswith("64"):
                repartition["Salaires"] += val
            else:
                repartition["Autres"] += val

    resultat = chiffre_affaires - charges
    evolution = [
        {"mois": m, "produits": float(v["produits"]),
         "charges": float(v["charges"]),
         "resultat": float(v["produits"] - v["charges"])}
        for m, v in sorted(monthly.items())
    ]
    total_rep = sum(repartition.values()) or Decimal(1)
    repartition_pct = [
        {"label": k, "montant": float(v),
         "pourcentage": round(float(v / total_rep) * 100, 1)}
        for k, v in repartition.items()
    ]

    return {
        "kpis": {
            "chiffre_affaires": float(chiffre_affaires),
            "total_achats": float(achats),
            "charges": float(charges),
            "resultat": float(resultat),
        },
        "evolution": evolution,
        "repartition_charges": repartition_pct,
    }
