from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from .serializers import LoginSerializer, UserSerializer


class LoginView(TokenObtainPairView):
    """POST /api/auth/login/ -> { access, refresh, user }"""

    permission_classes = [AllowAny]
    serializer_class = LoginSerializer


class LogoutView(APIView):
    """POST /api/auth/logout/. With stateless JWT the client just drops the
    token; we acknowledge so the frontend can clear its cookie."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        return Response({"detail": "Déconnecté."}, status=status.HTTP_200_OK)


class MeView(APIView):
    """GET /api/auth/me/ -> current user."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)
