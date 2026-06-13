from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from .serializers import (
    LoginSerializer,
    RegisterSerializer,
    UpdateProfileSerializer,
    UserSerializer,
)


class LoginView(TokenObtainPairView):
    """POST /api/auth/login/ -> { access, refresh, user }"""

    permission_classes = [AllowAny]
    serializer_class = LoginSerializer


class RegisterView(APIView):
    """POST /api/auth/register/ — public sign-up for a comptable account.
    Accepts multipart (username, password, email, phone, photo) and logs the
    new accountant in by returning JWT tokens."""

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        refresh = RefreshToken.for_user(user)
        refresh["role"] = user.role
        refresh["username"] = user.username
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": UserSerializer(user, context={"request": request}).data,
            },
            status=status.HTTP_201_CREATED,
        )


class LogoutView(APIView):
    """POST /api/auth/logout/. With stateless JWT the client just drops the
    token; we acknowledge so the frontend can clear its cookie."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        return Response({"detail": "Déconnecté."}, status=status.HTTP_200_OK)


class MeView(APIView):
    """GET /api/auth/me/ -> current user.
    PATCH /api/auth/me/ -> update own profile (username, email, phone, photo,
    password). Accepts multipart for the photo."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user, context={"request": request}).data)

    def patch(self, request):
        serializer = UpdateProfileSerializer(
            request.user, data=request.data, partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            UserSerializer(request.user, context={"request": request}).data
        )
