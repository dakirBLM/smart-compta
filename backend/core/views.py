from django.contrib.auth import get_user_model
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny

from .account_helpers import get_or_create_client_comptable
from .models import (
    ClientAccess,
    ClientComptable,
    Ecriture,
    Entreprise,
    ExerciceAnnee,
    Facture,
    Fournisseur,
    Journal,
    LigneEcriture,
    Message,
    SCFAccount,
)
from .bank_statements import (
    BankStatementError,
    fill_missing_statement_identity,
    import_bank_statement,
    preview_entries,
    validate_statement_identity,
)
from .permissions import IsAccountant, IsClient
from .reports import (
    build_balance,
    build_compte_resultat,
    build_dashboard,
    build_grand_livre,
)
from .scanner import (
    WebhookError,
    _parse_date,
    call_webhook,
    pdf_to_jpeg,
    persist_extraction,
    sanitize_bank_statement_data,
    upload_invoice_image,
    validate_extraction,
)
from .serializers import (
    ClientAccessSerializer,
    ClientComptableSerializer,
    CreateClientSerializer,
    EcritureSerializer,
    EntrepriseSerializer,
    ExerciceAnneeSerializer,
    FactureSerializer,
    FournisseurSerializer,
    JournalSerializer,
    MessageSerializer,
    SCFAccountSerializer,
)

User = get_user_model()


def _accountant_entreprise(request, pk):
    """Fetch an entreprise the requesting accountant owns (404 otherwise)."""
    return get_object_or_404(Entreprise, pk=pk, accountant=request.user)


def _assert_unique_piece(entreprise, numero, exclude_id=None, allow_ids=()):
    """Reject a duplicate invoice number within the same entreprise."""
    from rest_framework.exceptions import ValidationError
    numero = (numero or "").strip()
    if not numero:
        return
    qs = Ecriture.objects.filter(
        journal__entreprise=entreprise, numero_piece=numero
    )
    if exclude_id:
        qs = qs.exclude(pk=exclude_id)
    if allow_ids:
        qs = qs.exclude(pk__in=allow_ids)
    if qs.exists():
        raise ValidationError(
            {"numero_piece": f"Une écriture avec le numéro « {numero} » existe déjà."}
        )


def _reusable_accounted_facture(entreprise, numero):
    """Return the sole validated, unlinked facture for reuse, rejecting other duplicates."""
    from rest_framework.exceptions import ValidationError

    numero = (numero or "").strip()
    if not numero:
        return None

    matches = Facture.objects.select_for_update().filter(
        entreprise=entreprise, numero_facture=numero
    )
    reusable = matches.filter(
        statut=Facture.Statut.VALIDE, ecriture__isnull=True
    ).first()
    if reusable and not matches.exclude(pk=reusable.pk).exists():
        return reusable
    if matches.exists():
        raise ValidationError(
            {"numero_facture": f"Une facture N° « {numero} » existe déjà."}
        )
    return None


def _matching_invoice_payment(entreprise, facture):
    """Find the unique generated payment entry belonging to an orphaned invoice."""
    mode = (facture.mode_paiement or "").strip().lower()
    cash_modes = {"espèce", "espèces", "espece", "especes", "cash", "caisse", "liquide"}
    bank_modes = {
        "chèque", "cheque", "virement", "transfer", "transfert",
        "carte", "carte bancaire", "cb", "cheque bancaire", "banque",
    }
    if any(value in mode for value in cash_modes):
        journal_type, treasury_account = Journal.Type.CAISSE, "530000"
    elif any(value in mode for value in bank_modes):
        journal_type, treasury_account = Journal.Type.BANQUE, "512000"
    else:
        return None

    if not facture.numero_facture or not facture.date_facture:
        return None

    candidates = Ecriture.objects.filter(
        journal__entreprise=entreprise,
        journal__type_journal=journal_type,
        numero_piece=facture.numero_facture,
        date_ecriture=facture.date_facture,
        fournisseur_client__iexact=facture.fournisseur_client,
        mode_paiement__iexact=facture.mode_paiement,
        source__in=(Ecriture.Source.SCANNER, Ecriture.Source.IMPORT),
    ).prefetch_related("lignes")
    matches = []
    for entry in candidates:
        lines = list(entry.lignes.all())
        has_ttc_treasury_line = any(
            line.numero_compte == treasury_account
            and (line.montant_debit == facture.montant_ttc
                 or line.montant_credit == facture.montant_ttc)
            for line in lines
        )
        if len(lines) == 2 and has_ttc_treasury_line:
            matches.append(entry)
    return matches[0] if len(matches) == 1 else None


# --------------------------------------------------------------------------- #
# Entreprises
# --------------------------------------------------------------------------- #
class EntrepriseListCreateView(APIView):
    permission_classes = [IsAccountant]

    def get(self, request):
        qs = Entreprise.objects.filter(accountant=request.user)
        return Response(EntrepriseSerializer(qs, many=True).data)

    def post(self, request):
        serializer = EntrepriseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        entreprise = serializer.save(accountant=request.user)
        # Seed the first fiscal year from exercice_comptable if it is a year.
        try:
            annee = int(str(entreprise.exercice_comptable)[:4])
            ExerciceAnnee.objects.create(
                entreprise=entreprise, annee=annee, is_active=True
            )
        except (ValueError, TypeError):
            pass
        return Response(EntrepriseSerializer(entreprise).data,
                        status=status.HTTP_201_CREATED)


class EntrepriseDetailView(APIView):
    permission_classes = [IsAccountant]

    def get(self, request, pk):
        entreprise = _accountant_entreprise(request, pk)
        return Response(EntrepriseSerializer(entreprise).data)

    def put(self, request, pk):
        entreprise = _accountant_entreprise(request, pk)
        serializer = EntrepriseSerializer(entreprise, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        entreprise = _accountant_entreprise(request, pk)
        entreprise.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- #
# Clients (portail)
# --------------------------------------------------------------------------- #
class ClientListCreateView(APIView):
    permission_classes = [IsAccountant]

    def get(self, request, pk):
        entreprise = _accountant_entreprise(request, pk)
        qs = entreprise.client_accesses.select_related("client")
        return Response(ClientAccessSerializer(qs, many=True).data)

    @transaction.atomic
    def post(self, request, pk):
        entreprise = _accountant_entreprise(request, pk)
        serializer = CreateClientSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        client = User.objects.create_user(
            username=data["username"],
            password=data["password"],
            email=data.get("email", ""),
            phone=data.get("phone", ""),
            role=User.Role.CLIENT,
        )
        access = ClientAccess.objects.create(
            client=client, entreprise=entreprise, nom_client=data["nom_client"]
        )
        return Response(ClientAccessSerializer(access).data,
                        status=status.HTTP_201_CREATED)


class ClientDeleteView(APIView):
    permission_classes = [IsAccountant]

    def delete(self, request, pk, client_id):
        entreprise = _accountant_entreprise(request, pk)
        access = get_object_or_404(ClientAccess, entreprise=entreprise,
                                   client_id=client_id)
        access.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- #
# Fournisseurs (401)
# --------------------------------------------------------------------------- #
class FournisseurListCreateView(APIView):
    permission_classes = [IsAccountant]

    def get(self, request, pk):
        entreprise = _accountant_entreprise(request, pk)
        qs = entreprise.fournisseurs.all()
        q = (request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(nom__icontains=q)
        return Response(FournisseurSerializer(qs, many=True).data)

    def post(self, request, pk):
        from .account_helpers import next_account_number, _validate_not_self
        from django.core.exceptions import ValidationError
        
        entreprise = _accountant_entreprise(request, pk)
        serializer = FournisseurSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # Vérification : l'entreprise ne peut pas être son propre fournisseur
        nom = serializer.validated_data.get("nom", "").strip()
        if nom:
            try:
                _validate_not_self(entreprise, nom, "fournisseur")
            except ValidationError as e:
                return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        
        fournisseur = serializer.save(
            entreprise=entreprise,
            numero_compte=next_account_number(entreprise, "401"),
        )
        return Response(FournisseurSerializer(fournisseur).data,
                        status=status.HTTP_201_CREATED)


class FournisseurDetailView(APIView):
    """Détail, modification et suppression d'un fournisseur."""
    permission_classes = [IsAccountant]

    def _get(self, request, pk, fournisseur_id):
        entreprise = _accountant_entreprise(request, pk)
        return get_object_or_404(Fournisseur, pk=fournisseur_id, entreprise=entreprise)

    def get(self, request, pk, fournisseur_id):
        fournisseur = self._get(request, pk, fournisseur_id)
        return Response(FournisseurSerializer(fournisseur).data)

    def put(self, request, pk, fournisseur_id):
        fournisseur = self._get(request, pk, fournisseur_id)
        serializer = FournisseurSerializer(fournisseur, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk, fournisseur_id):
        self._get(request, pk, fournisseur_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- #
# Clients comptables (411)
# --------------------------------------------------------------------------- #
class ClientComptableListCreateView(APIView):
    permission_classes = [IsAccountant]

    def get(self, request, pk):
        entreprise = _accountant_entreprise(request, pk)
        qs = entreprise.clients_comptables.all()
        q = (request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(nom__icontains=q)
        return Response(ClientComptableSerializer(qs, many=True).data)

    def post(self, request, pk):
        from .account_helpers import next_account_number, _validate_not_self
        from django.core.exceptions import ValidationError
        
        entreprise = _accountant_entreprise(request, pk)
        serializer = ClientComptableSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # Vérification : l'entreprise ne peut pas être son propre client
        nom = serializer.validated_data.get("nom", "").strip()
        if nom:
            try:
                _validate_not_self(entreprise, nom, "client")
            except ValidationError as e:
                return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        
        client = serializer.save(
            entreprise=entreprise,
            numero_compte=next_account_number(entreprise, "411"),
        )
        return Response(ClientComptableSerializer(client).data,
                        status=status.HTTP_201_CREATED)


class ClientComptableDetailView(APIView):
    """Détail, modification et suppression d'un client comptable."""
    permission_classes = [IsAccountant]

    def _get(self, request, pk, client_id):
        entreprise = _accountant_entreprise(request, pk)
        return get_object_or_404(ClientComptable, pk=client_id, entreprise=entreprise)

    def get(self, request, pk, client_id):
        client = self._get(request, pk, client_id)
        return Response(ClientComptableSerializer(client).data)

    def put(self, request, pk, client_id):
        client = self._get(request, pk, client_id)
        serializer = ClientComptableSerializer(client, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk, client_id):
        self._get(request, pk, client_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- #
# Messages
# --------------------------------------------------------------------------- #
class ConversationListView(APIView):
    """Liste des conversations (un client portail par entreprise)."""
    permission_classes = [IsAccountant]

    def get(self, request, pk):
        entreprise = _accountant_entreprise(request, pk)
        accesses = entreprise.client_accesses.select_related("client").all()
        result = []
        for access in accesses:
            last = Message.objects.filter(
                entreprise=entreprise, client_user=access.client
            ).order_by("-created_at").first()
            unread = Message.objects.filter(
                entreprise=entreprise,
                client_user=access.client,
                sender=access.client,
                read_at__isnull=True,
            ).count()
            result.append({
                "client_id": access.client_id,
                "nom_client": access.nom_client,
                "username": access.client.username,
                "last_message": last.content if last else "",
                "last_message_at": last.created_at.isoformat() if last else None,
                "unread_count": unread,
            })
        return Response(result)


class MessageListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk=None, client_id=None):
        if request.user.role == "accountant" and pk and client_id:
            entreprise = _accountant_entreprise(request, pk)
            client_user = get_object_or_404(User, pk=client_id, role=User.Role.CLIENT)
            get_object_or_404(ClientAccess, entreprise=entreprise, client=client_user)
            qs = Message.objects.filter(
                entreprise=entreprise, client_user=client_user
            ).select_related("sender")
            # Mark client messages as read when accountant opens conversation
            Message.objects.filter(
                entreprise=entreprise,
                client_user=client_user,
                sender=client_user,
                read_at__isnull=True,
            ).update(read_at=timezone.now())
        elif request.user.role == "client":
            access = ClientAccess.objects.filter(client=request.user).select_related(
                "entreprise"
            ).first()
            if not access:
                return Response([])
            entreprise = access.entreprise
            client_user = request.user
            qs = Message.objects.filter(
                entreprise=entreprise, client_user=client_user
            ).select_related("sender")
            Message.objects.filter(
                entreprise=entreprise,
                client_user=client_user,
                sender=entreprise.accountant,
                read_at__isnull=True,
            ).update(read_at=timezone.now())
        else:
            return Response(status=status.HTTP_403_FORBIDDEN)
        return Response(
            MessageSerializer(qs, many=True, context={"request": request}).data
        )

    def post(self, request, pk=None, client_id=None):
        content = (request.data.get("content") or "").strip()
        if not content:
            return Response(
                {"content": "Le message ne peut pas être vide."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if request.user.role == "accountant" and pk and client_id:
            entreprise = _accountant_entreprise(request, pk)
            client_user = get_object_or_404(User, pk=client_id, role=User.Role.CLIENT)
            get_object_or_404(ClientAccess, entreprise=entreprise, client=client_user)
        elif request.user.role == "client":
            access = ClientAccess.objects.filter(client=request.user).select_related(
                "entreprise"
            ).first()
            if not access:
                return Response(
                    {"error": "Aucune entreprise associée. Veuillez contacter le comptable pour être ajouté."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            entreprise = access.entreprise
            client_user = request.user
        else:
            return Response(
                {"error": "Accès refusé. Seuls les comptables et les clients peuvent envoyer des messages."},
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            msg = Message.objects.create(
                entreprise=entreprise,
                sender=request.user,
                client_user=client_user,
                content=content,
            )
        except Exception as e:
            return Response(
                {"error": f"Erreur lors de la création du message: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        return Response(
            MessageSerializer(msg, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


# --------------------------------------------------------------------------- #
# Exercices
# --------------------------------------------------------------------------- #
class ExerciceListCreateView(APIView):
    permission_classes = [IsAccountant]

    def get(self, request, pk):
        entreprise = _accountant_entreprise(request, pk)
        return Response(ExerciceAnneeSerializer(entreprise.exercices.all(),
                                                many=True).data)

    def post(self, request, pk):
        entreprise = _accountant_entreprise(request, pk)
        serializer = ExerciceAnneeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        annee = serializer.validated_data["annee"]
        # Idempotent: don't 500 on a year that already exists.
        exercice, created = ExerciceAnnee.objects.get_or_create(
            entreprise=entreprise, annee=annee,
            defaults={"is_active": serializer.validated_data.get("is_active", False)},
        )
        return Response(
            ExerciceAnneeSerializer(exercice).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


# --------------------------------------------------------------------------- #
# Journaux & Ecritures
# --------------------------------------------------------------------------- #
class JournalListView(APIView):
    permission_classes = [IsAccountant]

    def get(self, request, pk):
        entreprise = _accountant_entreprise(request, pk)
        qs = entreprise.journaux.select_related("annee")
        annee = request.query_params.get("annee")
        if annee:
            qs = qs.filter(annee__annee=annee)
        return Response(JournalSerializer(qs, many=True).data)

    def post(self, request, pk):
        """Create a journal. Standard type (idempotent), or a custom journal
        identified only by its name (type 'autre')."""
        entreprise = _accountant_entreprise(request, pk)
        annee_id = request.data.get("annee")
        annee = get_object_or_404(ExerciceAnnee, pk=annee_id, entreprise=entreprise)
        nom = (request.data.get("nom") or "").strip()
        if nom:
            journal, _ = Journal.objects.get_or_create(
                entreprise=entreprise, annee=annee,
                type_journal=Journal.Type.AUTRE, nom=nom,
            )
        else:
            journal, _ = Journal.objects.get_or_create(
                entreprise=entreprise, annee=annee,
                type_journal=request.data.get("type_journal"), nom="",
            )
        return Response(JournalSerializer(journal).data,
                        status=status.HTTP_201_CREATED)


class JournalEcrituresView(APIView):
    permission_classes = [IsAccountant]

    def get(self, request, pk, journal_id):
        entreprise = _accountant_entreprise(request, pk)
        journal = get_object_or_404(Journal, pk=journal_id, entreprise=entreprise)
        qs = journal.ecritures.prefetch_related("lignes")

        # Journal Banque must expose only the bank-statement movements coming from
        # imported/scanned bank statements. Invoice settlements made by virement/
        # chèque/carte are already represented by the bank statement and must not
        # appear as extra entries in the Banque journal.
        if journal.type_journal == Journal.Type.BANQUE:
            qs = qs.filter(mode_paiement="relevé bancaire")

        # Optional filters: ?compte=... &date=YYYY-MM-DD
        compte = request.query_params.get("compte")
        date_filter = request.query_params.get("date")
        if compte:
            qs = qs.filter(lignes__numero_compte__icontains=compte).distinct()
        if date_filter:
            qs = qs.filter(date_ecriture=date_filter)
        return Response(EcritureSerializer(qs, many=True).data)

    def post(self, request, pk, journal_id):
        entreprise = _accountant_entreprise(request, pk)
        journal = get_object_or_404(Journal, pk=journal_id, entreprise=entreprise)
        _assert_unique_piece(entreprise, request.data.get("numero_piece"))
        serializer = EcritureSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(journal=journal)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class EcritureDetailView(APIView):
    permission_classes = [IsAccountant]

    def _get(self, request, pk):
        return get_object_or_404(
            Ecriture, pk=pk, journal__entreprise__accountant=request.user
        )

    def get(self, request, pk):
        return Response(EcritureSerializer(self._get(request, pk)).data)

    def put(self, request, pk):
        ecriture = self._get(request, pk)
        serializer = EcritureSerializer(ecriture, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        self._get(request, pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- #
# Scanner bridge
# --------------------------------------------------------------------------- #
class ScannerUploadView(APIView):
    """Receive an image, forward to the AI webhook, return the extraction."""

    permission_classes = [IsAuthenticated]

    def _entreprise_context(self, request):
        """Context the AI uses to classify the invoice: the scanning company's
        identity (sale vs purchase), its activity and the goods it deals in
        (to pick the right SCF accounts), plus an optional journal hint."""
        ent = None
        eid = request.data.get("entreprise")
        if request.user.role == "accountant" and eid:
            ent = Entreprise.objects.filter(id=eid, accountant=request.user).first()
        elif request.user.role == "client":
            access = (ClientAccess.objects.filter(client=request.user)
                      .select_related("entreprise").first())
            ent = access.entreprise if access else None
        ctx = {}
        if ent:
            ctx = {
                "entreprise_nom": ent.nom,
                "entreprise_nif": ent.nif,
                "activite": ", ".join(filter(None, [ent.activite, ent.activite2])),
                "marchandise": ent.marchandise,
                "matiere_premiere": ent.matiere_premiere,
                "matieres_consommables": ent.matieres_consommables,
            }
        # Optional journal the user pre-selected for this operation.
        hint = (request.data.get("journal_hint") or "").strip()
        if hint:
            ctx["journal_hint"] = hint
        return ctx

    def post(self, request):
        ctx = self._entreprise_context(request)
        try:
            if "file" in request.FILES:
                f = request.FILES["file"]
                raw = f.read()
                name = (f.name or "").lower()
                is_pdf = (
                    f.content_type == "application/pdf"
                    or name.endswith(".pdf")
                    or raw[:5] == b"%PDF-"
                )
                is_image = (
                    f.content_type in ("image/jpeg", "image/png")
                    or name.endswith((".jpg", ".jpeg", ".png"))
                )
                if not is_pdf and not is_image:
                    return Response(
                        {"error": "Format non supporté. Utilisez PDF, JPG, JPEG ou PNG."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if is_pdf:
                    # PC import: render ALL pages of the PDF into one image so
                    # the vision model receives the whole document.
                    raw = pdf_to_jpeg(raw)
                    data = call_webhook(image_bytes=raw, filename="facture.jpg", context=ctx)
                else:
                    data = call_webhook(image_bytes=raw, filename=f.name, context=ctx)
            else:
                image_b64 = request.data.get("image")
                if not image_b64:
                    return Response({"error": "Aucune image fournie."},
                                    status=status.HTTP_400_BAD_REQUEST)
                data = call_webhook(image_base64=image_b64, context=ctx)
        except WebhookError as exc:
            return Response({"error": str(exc)},
                            status=status.HTTP_502_BAD_GATEWAY)

        ent = None
        eid = request.data.get("entreprise")
        if request.user.role == "accountant" and eid:
            ent = Entreprise.objects.filter(id=eid, accountant=request.user).first()

        # Inject the user's journal hint into data so sanitize_bank_statement_data
        # can detect bank statements even when the AI didn't return "Banque".
        hint = (request.data.get("journal_hint") or "").strip()
        if hint and isinstance(data, dict):
            data.setdefault("journal_hint", hint)

        data = sanitize_bank_statement_data(data, entreprise=ent)

        errors = validate_extraction(data, entreprise=ent)
        return Response({"data": data, "erreurs": errors,
                         "confiance": data.get("confiance")})


class ScannerConfirmView(APIView):
    """Receive a confirmed AI JSON and persist Ecriture + LigneEcriture."""

    permission_classes = [IsAccountant]

    @transaction.atomic
    def post(self, request):
        import json as _json
        entreprise_id = request.data.get("entreprise")
        raw = request.data.get("data")
        if isinstance(raw, str):
            try:
                data = _json.loads(raw)
            except ValueError:
                data = {}
        else:
            data = raw or request.data
        entreprise = _accountant_entreprise(request, entreprise_id)
        data = sanitize_bank_statement_data(data, entreprise=entreprise)
        numero = data.get("numero_facture") or data.get("numero_piece")
        reusable_facture = _reusable_accounted_facture(
            entreprise, data.get("numero_facture")
        )
        payment_entry = (
            _matching_invoice_payment(entreprise, reusable_facture)
            if reusable_facture else None
        )
        _assert_unique_piece(
            entreprise, numero,
            allow_ids=(payment_entry.pk,) if payment_entry else (),
        )
        accounting_data = data
        if payment_entry:
            accounting_data = {**data, "mode_paiement": ""}
        try:
            ecriture = persist_extraction(entreprise, accounting_data, source="scanner")
        except WebhookError as exc:
            return Response({"error": str(exc)},
                            status=status.HTTP_400_BAD_REQUEST)
        if payment_entry:
            ecriture.mode_paiement = (
                data.get("mode_paiement") or reusable_facture.mode_paiement
            )
            ecriture.save(update_fields=["mode_paiement"])

        # Archive the comptabilisé invoice as an image in "Mes factures".
        image_url = ""
        if "file" in request.FILES:
            try:
                image_url = upload_invoice_image(request.FILES["file"].read())
            except WebhookError:
                image_url = ""
        facture_fields = {
            "entreprise": entreprise,
            "client": request.user,
            "numero_facture": data.get("numero_facture", "") or "",
            "date_facture": _parse_date(data.get("date_facture")),
            "montant_ht": data.get("montant_ht", 0) or 0,
            "tva_pourcentage": data.get("tva_pourcentage", 19) or 0,
            "montant_tva": data.get("montant_tva", 0) or 0,
            "montant_ttc": data.get("montant_ttc", 0) or 0,
            "image_url": image_url or (
                reusable_facture.image_url if reusable_facture else ""
            ),
            "statut": Facture.Statut.VALIDE,
            "confiance_ia": int(data.get("confiance", 0) or 0),
            "ecriture": ecriture,
            "fournisseur_client": data.get("fournisseur", "") or "",
            "type_facture": "banque" if any(
                k in str(data.get("journal")).lower() for k in ("banque", "relev")
            ) else ("vente" if "vente" in str(data.get("journal")).lower() else "achat"),
            "mode_paiement": (
                data.get("mode_paiement") or reusable_facture.mode_paiement
                if reusable_facture else data.get("mode_paiement", "") or ""
            ),
        }
        if reusable_facture:
            for field, value in facture_fields.items():
                setattr(reusable_facture, field, value)
            reusable_facture.save()
        else:
            try:
                Facture.objects.create(**facture_fields)
            except Exception:
                pass  # never fail the écriture because of facture archiving

        return Response(EcritureSerializer(ecriture).data,
                        status=status.HTTP_201_CREATED)


class BankStatementUploadView(APIView):
    permission_classes = [IsAccountant]

    def post(self, request, pk):
        entreprise = _accountant_entreprise(request, pk)
        if "file" not in request.FILES:
            return Response({"error": "Aucun relevé fourni."}, status=status.HTTP_400_BAD_REQUEST)

        uploaded = request.FILES["file"]
        raw = uploaded.read()
        name = (uploaded.name or "").lower()
        is_pdf = uploaded.content_type == "application/pdf" or name.endswith(".pdf") or raw[:5] == b"%PDF-"
        is_image = uploaded.content_type in ("image/jpeg", "image/png") or name.endswith((".jpg", ".jpeg", ".png"))
        if not is_pdf and not is_image:
            return Response(
                {"error": "Format non supporté. Utilisez PDF, JPG, JPEG ou PNG."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        context = {
            "entreprise_nom": entreprise.nom,
            "banque": entreprise.banque,
            "banque2": entreprise.banque2,
            "document_type": "releve_bancaire",
            "journal_hint": "Banque",
            "required_fields": "nom_banque,nom_entreprise",
        }
        try:
            if is_pdf:
                raw = pdf_to_jpeg(raw)
                data = call_webhook(image_bytes=raw, filename="releve-bancaire.jpg", context=context)
            else:
                data = call_webhook(image_bytes=raw, filename=uploaded.name, context=context)
            if isinstance(data, dict) and isinstance(data.get("data"), dict):
                data = data["data"]
            if not isinstance(data, dict):
                raise BankStatementError(
                    "Les données d'identité du relevé sont absentes. Import rejeté."
                )
            fill_missing_statement_identity(entreprise, data)
            nom_banque, nom_entreprise = validate_statement_identity(entreprise, data)
            data["nom_banque"] = nom_banque
            data["nom_entreprise"] = nom_entreprise
        except (WebhookError, BankStatementError) as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "data": data,
            "nom_banque_valide": True,
            "nom_entreprise_valide": True,
            "ecritures_preview": preview_entries(data),
            "confiance": data.get("confiance"),
        })


class BankStatementImportView(APIView):
    permission_classes = [IsAccountant]

    def post(self, request, pk):
        entreprise = _accountant_entreprise(request, pk)
        data = request.data.get("data") or request.data
        if not isinstance(data, dict):
            return Response({"error": "Données de relevé invalides."}, status=status.HTTP_400_BAD_REQUEST)
        fill_missing_statement_identity(entreprise, data)
        try:
            entries = import_bank_statement(entreprise, data)
        except BankStatementError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "nom_banque_valide": True,
            "nom_entreprise_valide": True,
            "ecritures_creees": len(entries),
            "ecritures": EcritureSerializer(entries, many=True).data,
        }, status=status.HTTP_201_CREATED)


class SCFListView(APIView):
    permission_classes = [IsAccountant]

    def get(self, request, pk=None):
        if pk is None:
            queryset = SCFAccount.objects.filter(entreprise__isnull=True)
        else:
            entreprise = _accountant_entreprise(request, pk)
            queryset = SCFAccount.objects.filter(
                entreprise__isnull=True
            ) | SCFAccount.objects.filter(entreprise=entreprise)
        global_accounts = list(queryset.filter(entreprise__isnull=True))
        grouped = {str(classe): [] for classe in range(1, 9)}
        for account in queryset.distinct().order_by("classe", "numero_compte"):
            item = {
                "numero_compte": account.numero_compte,
                "libelle": account.libelle,
            }
            if account.entreprise_id:
                parents = [
                    parent.numero_compte
                    for parent in global_accounts
                    if account.numero_compte.startswith(parent.numero_compte)
                ]
                if parents:
                    item["parent"] = max(parents, key=len)
            grouped.setdefault(str(account.classe), []).append(item)
        return Response(grouped)


# --------------------------------------------------------------------------- #
# Factures (client side)
# --------------------------------------------------------------------------- #
class FactureListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role == "accountant":
            qs = Facture.objects.filter(entreprise__accountant=request.user)
            ent = request.query_params.get("entreprise")
            if ent:
                qs = qs.filter(entreprise_id=ent)
        else:
            qs = Facture.objects.filter(client=request.user)
        return Response(FactureSerializer(qs, many=True).data)

    @transaction.atomic
    def post(self, request):
        # A client or accountant uploads a facture
        access = ClientAccess.objects.filter(client=request.user).first()
        if request.user.role == "accountant":
            entreprise_id = request.data.get("entreprise")
        else:
            entreprise_id = access.entreprise_id if access else None

        if not entreprise_id:
            return Response({"error": "Aucune entreprise associée."},
                            status=status.HTTP_400_BAD_REQUEST)

        if request.user.role == "accountant":
            entreprise = get_object_or_404(
                Entreprise, id=entreprise_id, accountant=request.user
            )
        else:
            entreprise = get_object_or_404(
                Entreprise, id=entreprise_id,
                client_accesses__client=request.user,
            )

        numero = (request.data.get("numero_facture") or "").strip()
        reusable_facture = None
        payment_entry = None
        if request.user.role == "accountant":
            reusable_facture = _reusable_accounted_facture(entreprise, numero)
            if reusable_facture:
                payment_entry = _matching_invoice_payment(
                    entreprise, reusable_facture
                )
            _assert_unique_piece(
                entreprise, numero,
                allow_ids=(payment_entry.pk,) if payment_entry else (),
            )
        elif numero and Facture.objects.filter(
            entreprise=entreprise, numero_facture=numero
        ).exists():
            return Response(
                {"numero_facture": f"Une facture N° « {numero} » existe déjà."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Keep the invoice as an image: upload the file to storage and store URL.
        image_url = request.data.get("image_url") or ""
        if "file" in request.FILES:
            try:
                image_url = upload_invoice_image(request.FILES["file"].read()) or image_url
            except WebhookError:
                pass

        # Parse the AI extracted data
        import json as _json
        lignes_raw = request.data.get("lignes") or "[]"
        if isinstance(lignes_raw, str):
            try:
                lignes = _json.loads(lignes_raw)
            except ValueError:
                lignes = []
        else:
            lignes = lignes_raw

        extraction_data = {
            "fournisseur": request.data.get("fournisseur_client") or request.data.get("fournisseur") or "",
            "date_facture": request.data.get("date_facture") or "",
            "numero_facture": numero,
            "montant_ht": float(request.data.get("montant_ht") or 0),
            "tva_pourcentage": float(request.data.get("tva_pourcentage") or 19),
            "montant_tva": float(request.data.get("montant_tva") or 0),
            "montant_ttc": float(request.data.get("montant_ttc") or 0),
            "journal": "Ventes" if request.data.get("type_facture") == "vente" else "Achats",
            "confiance": int(request.data.get("confiance_ia") or 95),
            "mode_paiement": request.data.get("mode_paiement") or "",
            "lignes": lignes,
        }

        fournisseur_client = extraction_data["fournisseur"]
        type_facture = request.data.get("type_facture") or "achat"
        mode_paiement = (
            extraction_data["mode_paiement"]
            or (reusable_facture.mode_paiement if reusable_facture else "")
        )

        # Si l'utilisateur est un CLIENT (role != "accountant"), la facture est enregistrée
        # en statut "EN_COURS" dans "Mes factures". Le comptable la validera manuellement.
        if request.user.role != "accountant":
            from .scanner import _parse_date
            date_fact = _parse_date(extraction_data["date_facture"]) if extraction_data["date_facture"] else None
            facture = Facture.objects.create(
                entreprise=entreprise,
                client=request.user,
                numero_facture=numero,
                date_facture=date_fact,
                montant_ht=extraction_data["montant_ht"],
                tva_pourcentage=extraction_data["tva_pourcentage"],
                montant_tva=extraction_data["montant_tva"],
                montant_ttc=extraction_data["montant_ttc"],
                image_url=image_url,
                statut=Facture.Statut.EN_COURS,
                confiance_ia=extraction_data["confiance"],
                ecriture=None,
                fournisseur_client=fournisseur_client,
                type_facture=type_facture,
                mode_paiement=mode_paiement,
            )
            return Response(FactureSerializer(facture).data, status=status.HTTP_201_CREATED)

        # Si l'utilisateur est un COMPTABLE, comptabilisation automatique directe
        accounting_data = extraction_data
        if payment_entry:
            accounting_data = {**extraction_data, "mode_paiement": ""}
        try:
            ecriture = persist_extraction(entreprise, accounting_data, source="import")
        except Exception as exc:
            return Response({"error": f"Erreur lors de la comptabilisation: {str(exc)}"},
                            status=status.HTTP_400_BAD_REQUEST)
        if payment_entry:
            ecriture.mode_paiement = mode_paiement
            ecriture.save(update_fields=["mode_paiement"])

        facture_fields = {
            "entreprise": entreprise,
            "client": request.user,
            "numero_facture": numero,
            "date_facture": ecriture.date_ecriture,
            "montant_ht": extraction_data["montant_ht"],
            "tva_pourcentage": extraction_data["tva_pourcentage"],
            "montant_tva": extraction_data["montant_tva"],
            "montant_ttc": extraction_data["montant_ttc"],
            "image_url": image_url or (
                reusable_facture.image_url if reusable_facture else ""
            ),
            "statut": Facture.Statut.VALIDE,
            "confiance_ia": extraction_data["confiance"],
            "ecriture": ecriture,
            "fournisseur_client": fournisseur_client,
            "type_facture": type_facture,
            "mode_paiement": mode_paiement,
        }
        if reusable_facture:
            for field, value in facture_fields.items():
                setattr(reusable_facture, field, value)
            reusable_facture.save()
        else:
            facture = Facture.objects.create(**facture_fields)

        facture = reusable_facture or facture
        return Response(FactureSerializer(facture).data, status=status.HTTP_201_CREATED)


class FactureDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        if request.user.role == "accountant":
            facture = get_object_or_404(
                Facture, pk=pk, entreprise__accountant=request.user)
        else:
            facture = get_object_or_404(Facture, pk=pk, client=request.user)
        return Response(FactureSerializer(facture).data)


# --------------------------------------------------------------------------- #
# Facture – Validate & auto-post to Banque / Caisse
# --------------------------------------------------------------------------- #
class FactureValidateView(APIView):
    """Validate a client facture manually (legacy / fallback)
    
    CORRECTION : L'entreprise ne peut pas être son propre client/fournisseur.
    """

    permission_classes = [IsAccountant]

    @transaction.atomic
    def post(self, request, pk):
        from django.core.exceptions import ValidationError
        from .account_helpers import _validate_not_self
        
        facture = get_object_or_404(
            Facture, pk=pk, entreprise__accountant=request.user
        )
        if facture.statut == Facture.Statut.VALIDE and facture.ecriture_id:
            return Response(
                {"error": "Facture déjà validée."},
                status=status.HTTP_409_CONFLICT,
            )

        mode = (request.data.get("mode_paiement") or facture.mode_paiement or "").lower().strip()
        entreprise = facture.entreprise

        # Determine which journal to post to
        is_vente = facture.type_facture == "vente"
        is_banque = facture.type_facture == "banque"
        journal_name = "Banque" if is_banque else ("Ventes" if is_vente else "Achats")
        
        tiers_nom = facture.fournisseur_client or ("Banque" if is_banque else "")
        if not is_banque:
            if tiers_nom:
                try:
                    _validate_not_self(entreprise, tiers_nom, "client" if is_vente else "fournisseur")
                except ValidationError as e:
                    return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
            else:
                return Response(
                    {"error": "Le nom du client/fournisseur est obligatoire pour valider la facture."},
                    status=status.HTTP_400_BAD_REQUEST
                )

        # Re-run automated accounting using updated persist_extraction
        if is_banque:
            lignes = [
                {
                    "libelle": f"Mouvement bancaire — {tiers_nom or 'Opération'}",
                    "debit": float(facture.montant_ttc),
                    "credit": 0,
                    "tiers": tiers_nom,
                }
            ]
        else:
            lignes = [
                {
                    "compte": "411" if is_vente else "401",
                    "libelle": tiers_nom,
                    "debit": float(facture.montant_ttc) if is_vente else 0,
                    "credit": 0 if is_vente else float(facture.montant_ttc),
                },
                {
                    "compte": "700000" if is_vente else "6011",
                    "libelle": "Vente de marchandises" if is_vente else "Achats de marchandises",
                    "debit": 0 if is_vente else float(facture.montant_ht),
                    "credit": float(facture.montant_ht) if is_vente else 0,
                }
            ]
            if float(facture.montant_tva) > 0:
                lignes.append({
                    "compte": "445700" if is_vente else "44566",
                    "libelle": "TVA collectée" if is_vente else "TVA déductible",
                    "debit": 0 if is_vente else float(facture.montant_tva),
                    "credit": float(facture.montant_tva) if is_vente else 0,
                })

        extraction_data = {
            "fournisseur": tiers_nom,
            "date_facture": str(facture.date_facture) if facture.date_facture else "",
            "numero_facture": facture.numero_facture,
            "montant_ht": float(facture.montant_ht),
            "tva_pourcentage": float(facture.tva_pourcentage),
            "montant_tva": float(facture.montant_tva),
            "montant_ttc": float(facture.montant_ttc),
            "journal": journal_name,
            "confiance": int(facture.confiance_ia or 95),
            "mode_paiement": mode,
            "lignes": lignes,
        }


        try:
            ecriture = persist_extraction(entreprise, extraction_data, source="import")
        except Exception as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        facture.statut = Facture.Statut.VALIDE
        facture.ecriture = ecriture
        facture.mode_paiement = mode
        facture.save()

        return Response(
            {
                "facture": FactureSerializer(facture).data,
                "ecriture": EcritureSerializer(ecriture).data,
            },
            status=status.HTTP_201_CREATED,
        )


# --------------------------------------------------------------------------- #
# Reports
# --------------------------------------------------------------------------- #
def _annee_param(request):
    annee = request.query_params.get("annee")
    return int(annee) if annee else None


class BalanceView(APIView):
    permission_classes = [IsAccountant]

    def get(self, request, pk):
        entreprise = _accountant_entreprise(request, pk)
        return Response(build_balance(entreprise, _annee_param(request)))


class CompteResultatView(APIView):
    permission_classes = [IsAccountant]

    def get(self, request, pk):
        entreprise = _accountant_entreprise(request, pk)
        return Response(build_compte_resultat(entreprise, _annee_param(request)))


class GrandLivreView(APIView):
    permission_classes = [IsAccountant]

    def get(self, request, pk):
        entreprise = _accountant_entreprise(request, pk)
        return Response(build_grand_livre(
            entreprise, _annee_param(request),
            request.query_params.get("start"),
            request.query_params.get("end"),
        ))


class DashboardView(APIView):
    permission_classes = [IsAccountant]

    def get(self, request, pk):
        entreprise = _accountant_entreprise(request, pk)
        return Response(build_dashboard(entreprise, _annee_param(request)))


# --------------------------------------------------------------------------- #
# Local mock AI webhook (dev only)
# --------------------------------------------------------------------------- #
class MockWebhookView(APIView):
    """A stand-in for the real AI service so the scanner works out of the box
    in local dev. Point WEBHOOK_URL at this endpoint to demo the full flow.
    Returns the canonical sample extraction described in the spec."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        hint = str(request.data.get("journal_hint") or request.data.get("journal") or "").lower()
        is_vente = "vente" in hint
        is_banque = (
            "banque" in hint
            or "relev" in hint
            or str(request.data.get("document_type") or "").lower() == "releve_bancaire"
        )

        if is_banque:
            return Response({
                "journal": "Banque",
                "type_facture": "banque",
                "nom_banque": request.data.get("banque") or "BNA",
                "nom_entreprise": request.data.get("entreprise_nom") or "Entreprise test",
                "fournisseur": "Banque CPA",
                "date_facture": "28/02/2026",
                "numero_facture": "RELEV-20260228",
                "numero_releve": "2026-02",
                "montant_ht": 0,
                "tva_pourcentage": 0,
                "montant_tva": 0,
                "montant_ttc": 150000.00,
                "mode_paiement": "Virement",
                "confiance": 95,
                "lignes": [
                    {"date": "07/02/2026", "libelle": "Virement client SARL Dupont", "tiers": "SARL Dupont", "debit": 0, "credit": 85000.00},
                    {"date": "12/02/2026", "libelle": "Règlement fournisseur EURL Matériaux", "tiers": "EURL Matériaux", "debit": 45000.00, "credit": 0},
                    {"date": "20/02/2026", "libelle": "Frais bancaires — tenue de compte", "tiers": "Banque CPA", "debit": 1500.00, "credit": 0},
                    {"date": "28/02/2026", "libelle": "Virement client Mohamed Seghir", "tiers": "Mohamed Seghir", "debit": 0, "credit": 65000.00},
                ],
                "erreurs": [],
            })

        mode_paiement = "espèces"
        if is_banque or "virement" in hint or "chèque" in hint:
            mode_paiement = "chèque"

        if is_vente:
            return Response({
                "fournisseur": "Client Durable",
                "date_facture": "15/05/2024",
                "numero_facture": "V2024-0012",
                "montant_ht": 100000.00,
                "tva_pourcentage": 19,
                "montant_tva": 19000.00,
                "montant_ttc": 119000.00,
                "journal": "Ventes",
                "mode_paiement": mode_paiement,
                "confiance": 95,
                "lignes": [
                    {"compte": "411", "libelle": "Client Durable", "debit": 119000.00, "credit": 0.00},
                    {"compte": "700000", "libelle": "Vente de marchandises", "debit": 0.00, "credit": 100000.00},
                    {"compte": "445700", "libelle": "TVA collectée", "debit": 0.00, "credit": 19000.00}
                ],
                "statut": "en_cours",
                "erreurs": [],
            })
        else:
            return Response({
                "fournisseur": "SARL ABC",
                "date_facture": "15/05/2024",
                "numero_facture": "F2024-0158",
                "montant_ht": 100000.00,
                "tva_pourcentage": 19,
                "montant_tva": 19000.00,
                "montant_ttc": 119000.00,
                "journal": "Achats",
                "mode_paiement": mode_paiement,
                "confiance": 95,
                "lignes": [
                    {"compte": "6011", "libelle": "Achats de marchandises",
                     "debit": 100000.00, "credit": 0.00},
                    {"compte": "44566", "libelle": "TVA déductible",
                     "debit": 19000.00, "credit": 0.00},
                    {"compte": "4011", "libelle": "Fournisseurs",
                     "debit": 0.00, "credit": 119000.00},
                ],
                "statut": "en_cours",
                "erreurs": [],
            })