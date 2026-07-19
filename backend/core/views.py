from django.contrib.auth import get_user_model
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

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
)
from rest_framework.permissions import AllowAny

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
)

User = get_user_model()


def _accountant_entreprise(request, pk):
    """Fetch an entreprise the requesting accountant owns (404 otherwise)."""
    return get_object_or_404(Entreprise, pk=pk, accountant=request.user)


def _assert_unique_piece(entreprise, numero, exclude_id=None):
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
    if qs.exists():
        raise ValidationError(
            {"numero_piece": f"Une écriture avec le numéro « {numero} » existe déjà."}
        )


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
# Clients
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
# Fournisseurs
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
        from .account_helpers import next_account_number
        entreprise = _accountant_entreprise(request, pk)
        serializer = FournisseurSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        fournisseur = serializer.save(
            entreprise=entreprise,
            numero_compte=next_account_number(entreprise, "401"),
        )
        return Response(FournisseurSerializer(fournisseur).data,
                        status=status.HTTP_201_CREATED)


class FournisseurDetailView(APIView):
    permission_classes = [IsAccountant]

    def _get(self, request, pk, fournisseur_id):
        entreprise = _accountant_entreprise(request, pk)
        return get_object_or_404(Fournisseur, pk=fournisseur_id, entreprise=entreprise)

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
# Clients comptables (comptes 411) — miroir des fournisseurs (401)
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
        from .account_helpers import next_account_number
        entreprise = _accountant_entreprise(request, pk)
        serializer = ClientComptableSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        client = serializer.save(
            entreprise=entreprise,
            numero_compte=next_account_number(entreprise, "411"),
        )
        return Response(ClientComptableSerializer(client).data,
                        status=status.HTTP_201_CREATED)


class ClientComptableDetailView(APIView):
    permission_classes = [IsAccountant]

    def _get(self, request, pk, client_id):
        entreprise = _accountant_entreprise(request, pk)
        return get_object_or_404(ClientComptable, pk=client_id, entreprise=entreprise)

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

        errors = validate_extraction(data)
        return Response({"data": data, "erreurs": errors,
                         "confiance": data.get("confiance")})


class ScannerConfirmView(APIView):
    """Receive a confirmed AI JSON and persist Ecriture + LigneEcriture."""

    permission_classes = [IsAccountant]

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
        _assert_unique_piece(entreprise, data.get("numero_facture") or data.get("numero_piece"))
        try:
            ecriture = persist_extraction(entreprise, data, source="scanner")
        except WebhookError as exc:
            return Response({"error": str(exc)},
                            status=status.HTTP_400_BAD_REQUEST)

        # Archive the comptabilisé invoice as an image in "Mes factures".
        image_url = ""
        if "file" in request.FILES:
            try:
                image_url = upload_invoice_image(request.FILES["file"].read())
            except WebhookError:
                image_url = ""
        try:
            Facture.objects.create(
                entreprise=entreprise,
                client=request.user,
                numero_facture=data.get("numero_facture", "") or "",
                date_facture=_parse_date(data.get("date_facture")),
                montant_ht=data.get("montant_ht", 0) or 0,
                tva_pourcentage=data.get("tva_pourcentage", 19) or 0,
                montant_tva=data.get("montant_tva", 0) or 0,
                montant_ttc=data.get("montant_ttc", 0) or 0,
                image_url=image_url,
                statut=Facture.Statut.VALIDE,
                confiance_ia=int(data.get("confiance", 0) or 0),
                ecriture=ecriture,
            )
        except Exception:
            pass  # never fail the écriture because of facture archiving

        return Response(EcritureSerializer(ecriture).data,
                        status=status.HTTP_201_CREATED)


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

    def post(self, request):
        # A client uploads a facture against the entreprise they have access to.
        access = ClientAccess.objects.filter(client=request.user).first()
        entreprise_id = request.data.get("entreprise") or (
            access.entreprise_id if access else None
        )
        if not entreprise_id:
            return Response({"error": "Aucune entreprise associée."},
                            status=status.HTTP_400_BAD_REQUEST)

        # Duplicate invoice number guard (per entreprise).
        numero = (request.data.get("numero_facture") or "").strip()
        if numero and Facture.objects.filter(
            entreprise_id=entreprise_id, numero_facture=numero
        ).exists():
            return Response(
                {"numero_facture": f"Une facture N° « {numero} » existe déjà."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Keep the invoice as an image: upload the file to storage and store URL.
        # Non-blocking — if storage isn't available the facture still saves.
        image_url = request.data.get("image_url") or ""
        if "file" in request.FILES:
            try:
                image_url = upload_invoice_image(request.FILES["file"].read()) or image_url
            except WebhookError:
                pass

        serializer = FactureSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(client=request.user, entreprise_id=entreprise_id,
                        image_url=image_url)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


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
    """Validate a client facture and auto-create the matching Ecriture in the
    Banque journal (cheque / virement) or Caisse journal (espèces).
    For cash payments (espèces) the system also creates an entry in the
    Caisse journal automatically."""

    permission_classes = [IsAccountant]

    @transaction.atomic
    def post(self, request, pk):
        facture = get_object_or_404(
            Facture, pk=pk, entreprise__accountant=request.user
        )
        if facture.statut == Facture.Statut.VALIDE and facture.ecriture_id:
            return Response(
                {"error": "Facture déjà validée."},
                status=status.HTTP_409_CONFLICT,
            )

        # Normalize incoming mode_paiement and prefer explicit request value,
        # then existing facture value. Require a non-empty, supported mode.
        mode = (request.data.get("mode_paiement") or facture.mode_paiement or "").lower().strip()
        if not mode:
            return Response(
                {"error": "Le mode de paiement est obligatoire pour valider la facture."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Whitelist known cash vs bank payment modes. Reject unknown values.
        CASH_MODES = {"espèce", "espèces", "espece", "especes", "cash"}
        BANK_MODES = {
            "chèque", "cheque", "virement", "transfer", "transfert",
            "carte", "carte bancaire", "cb", "cheque bancaire"
        }

        if mode in CASH_MODES:
            is_cash = True
        elif mode in BANK_MODES:
            is_cash = False
        else:
            return Response(
                {"error": f"Mode de paiement non supporté: '{mode}'. Valeurs acceptées: {sorted(list(CASH_MODES | BANK_MODES))}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Determine which journal to post to.
        journal_type = Journal.Type.CAISSE if is_cash else Journal.Type.BANQUE

        entreprise = facture.entreprise

        # Find active exercise year
        annee_obj = None
        if facture.date_facture:
            try:
                year = facture.date_facture.year
                annee_obj = ExerciceAnnee.objects.filter(
                    entreprise=entreprise, annee=year
                ).first()
            except Exception:
                pass
        if not annee_obj:
            annee_obj = ExerciceAnnee.objects.filter(
                entreprise=entreprise, is_active=True
            ).first()
        if not annee_obj:
            return Response(
                {"error": "Aucun exercice comptable actif trouvé."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        client_nom = facture.client.username
        # Résoudre le nom du client portail (nom_client si disponible)
        access = ClientAccess.objects.filter(
            entreprise=entreprise, client=facture.client
        ).first()
        display_nom = access.nom_client if access else client_nom
        client_comptable = get_or_create_client_comptable(entreprise, display_nom)
        compte_client = client_comptable.numero_compte

        ttc = facture.montant_ttc
        ht = facture.montant_ht or ttc
        tva = facture.montant_tva or 0
        date_f = facture.date_facture
        if not date_f:
            return Response(
                 {"error": "La date de facture est obligatoire pour valider."},
                 status=status.HTTP_400_BAD_REQUEST,
            )
        numero = facture.numero_facture

        # --- 1) écriture de VENTE dans le journal Ventes (la facture) -------
        vente_journal, _ = Journal.objects.get_or_create(
            entreprise=entreprise, annee=annee_obj,
            type_journal=Journal.Type.VENTE,
        )
        vente = Ecriture.objects.create(
            journal=vente_journal,
            date_ecriture=date_f,
            numero_piece=numero,
            fournisseur_client=display_nom,
            source=Ecriture.Source.MANUEL,
            mode_paiement=mode,
            statut=Ecriture.Statut.VALIDE,
        )
        vente_lignes = [
            (compte_client, f"Client {display_nom} — Facture {numero}", ttc, 0),
            ("700000", f"Vente de marchandises — {numero}", 0, ht),
        ]
        if tva and float(tva) > 0:
            vente_lignes.append(("445700", f"TVA collectée — {numero}", 0, tva))
        for compte, libelle, deb, cred in vente_lignes:
            LigneEcriture.objects.create(
                ecriture=vente, numero_compte=compte, libelle=libelle,
                montant_debit=deb, montant_credit=cred,
            )

        # --- 2) écriture de RÈGLEMENT (TTC, 2 lignes) ------------------------
        # Caisse (530000) si espèces, Banque (512000) sinon.
        journal, _ = Journal.objects.get_or_create(
            entreprise=entreprise,
            annee=annee_obj,
            type_journal=journal_type,
        )
        compte_tresorerie = "530000" if is_cash else "512000"
        lib_encaissement = "Encaissement espèces" if is_cash else "Encaissement banque"
        ecriture = Ecriture.objects.create(
            journal=journal,
            date_ecriture=date_f,
            numero_piece=numero,
            fournisseur_client=display_nom,
            source=Ecriture.Source.MANUEL,
            mode_paiement=mode,
            statut=Ecriture.Statut.VALIDE,
        )
        for compte, libelle, deb, cred in [
            (compte_tresorerie, f"{lib_encaissement} {numero} — {display_nom}", ttc, 0),
            (compte_client, f"Règlement client {display_nom} — {numero}", 0, ttc),
        ]:
            LigneEcriture.objects.create(
                ecriture=ecriture, numero_compte=compte, libelle=libelle,
                montant_debit=deb, montant_credit=cred,
            )

        # Update facture — liée à l'écriture de vente (la facture elle-même).
        facture.statut = Facture.Statut.VALIDE
        facture.ecriture = vente
        if mode:
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
        return Response({
            "fournisseur": "SARL ABC",
            "date_facture": "15/05/2024",
            "numero_facture": "F2024-0158",
            "montant_ht": 100000.00,
            "tva_pourcentage": 19,
            "montant_tva": 19000.00,
            "montant_ttc": 119000.00,
            "journal": "Achats",
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
