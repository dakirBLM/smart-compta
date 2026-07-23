export type Role = "accountant" | "client";

export interface User {
  id: number;
  username: string;
  email: string;
  role: Role;
  phone: string;
  photo?: string | null;
  first_name?: string;
  last_name?: string;
  created_at: string;
}

export interface ExerciceAnnee {
  id: number;
  entreprise: number;
  annee: number;
  is_active: boolean;
}

export interface Entreprise {
  id: number;
  nom: string;
  nif: string;
  nis: string;
  nin: string;
  date_creation: string;
  adresse: string;
  ville: string;
  code_postal: string;
  exercice_comptable: string;
  banque: string;
  numero_compte: string;
  rib: string;
  banque2: string;
  numero_compte2: string;
  rib2: string;
  regime_fiscale: string;
  activite: string;
  activite2: string;
  matiere_premiere: string;
  marchandise: string;
  matieres_consommables: string;
  telephone: string;
  email: string;
  created_at: string;
  exercices: ExerciceAnnee[];
  clients_count: number;
}

export interface ClientAccess {
  id: number;
  client: number;
  entreprise: number;
  nom_client: string;
  username: string;
  email: string;
  created_at: string;
}

export interface Fournisseur {
  id: number;
  entreprise: number;
  nom: string;
  numero_compte: string;
  email: string;
  telephone: string;
  adresse: string;
  created_at: string;
}

/** Client comptable (compte 411) — miroir de Fournisseur (401). */
export interface ClientComptable {
  id: number;
  entreprise: number;
  nom: string;
  numero_compte: string;
  email: string;
  telephone: string;
  adresse: string;
  created_at: string;
}

export interface Conversation {
  client_id: number;
  nom_client: string;
  username: string;
  last_message: string;
  last_message_at: string | null;
  unread_count: number;
}

export interface ChatMessage {
  id: number;
  entreprise: number;
  sender: number;
  sender_username: string;
  sender_role: Role;
  client_user: number;
  content: string;
  read_at: string | null;
  created_at: string;
  is_mine: boolean;
}

export type JournalType =
  | "achat"
  | "vente"
  | "banque"
  | "caisse"
  | "od"
  | "autre";

export interface Journal {
  id: number;
  entreprise: number;
  annee: number;
  type_journal: JournalType;
  nom: string;
  type_label: string;
  ecritures_count: number;
  created_at: string;
}

export interface LigneEcriture {
  id?: number;
  numero_compte: string;
  libelle: string;
  montant_debit: number;
  montant_credit: number;
}

export type Statut = "en_cours" | "valide" | "rejete";

export interface Ecriture {
  id: number;
  journal: number;
  date_ecriture: string;
  numero_piece: string;
  fournisseur_client: string;
  source: "manuel" | "import" | "scanner";
  confiance_ia: number | null;
  statut: Statut;
  mode_paiement: string;
  created_at: string;
  lignes: LigneEcriture[];
  total_debit: number;
  total_credit: number;
}

export interface Facture {
  id: number;
  entreprise: number;
  client: number;
  client_nom: string;
  numero_facture: string;
  date_facture: string;
  montant_ht: number;
  tva_pourcentage: number;
  montant_tva: number;
  montant_ttc: number;
  image_url: string;
  statut: Statut;
  confiance_ia: number | null;
  ecriture: number | null;
  mode_paiement: string;
  created_at: string;
}

/** Shape of the AI webhook extraction (consumed by the scanner flow). */
export interface AILigne {
  compte: string;
  libelle: string;
  debit: number;
  credit: number;
}

export interface AIExtraction {
  fournisseur: string;
  date_facture: string;
  numero_facture: string;
  montant_ht: number;
  tva_pourcentage: number;
  montant_tva: number;
  montant_ttc: number;
  journal: string;
  confiance: number;
  /** Mode de paiement détecté sur la facture (espèces, chèque, virement…). */
  mode_paiement?: string;
  lignes: AILigne[];
  statut: string;
  erreurs: string[];
}

export interface DashboardData {
  kpis: {
    chiffre_affaires: number;
    total_achats: number;
    charges: number;
    resultat: number;
  };
  evolution: { mois: string; produits: number; charges: number; resultat: number }[];
  repartition_charges: { label: string; montant: number; pourcentage: number }[];
}
