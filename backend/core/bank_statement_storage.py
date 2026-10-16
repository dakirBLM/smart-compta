from django.core.files.storage import Storage, default_storage
from django.utils.deconstruct import deconstructible


@deconstructible
class BankStatementStorage(Storage):
    """Use Django's configured default storage without exposing its URL."""

    def __init__(self):
        self.backend = default_storage

    def _open(self, name, mode="rb"):
        return self.backend.open(name, mode)

    def _save(self, name, content):
        return self.backend.save(name, content)

    def delete(self, name):
        self.backend.delete(name)

    def exists(self, name):
        return self.backend.exists(name)

    def size(self, name):
        return self.backend.size(name)

    def url(self, name):
        raise NotImplementedError(
            "Bank statement documents are available only through authenticated downloads."
        )