class ServiceError(Exception):
    """Domain error carrying an HTTP status; API v1 turns it into {"detail": ...} (ADR 0014 §2)."""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class LastAdminError(ServiceError):
    """Last Admin Protection (ADR 0004, docs/3-silnik-dzierzawy §4): HTTP 403 with the GitHub mock's message."""

    def __init__(self, detail: str) -> None:
        super().__init__(403, detail)
