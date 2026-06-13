from rest_framework.permissions import BasePermission


class IsAccountant(BasePermission):
    message = "Réservé aux comptables."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated
                    and request.user.role == "accountant")


class IsClient(BasePermission):
    message = "Réservé aux clients."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated
                    and request.user.role == "client")
