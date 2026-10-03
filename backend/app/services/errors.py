class ServiceError(Exception):
    """Domain error carrying an HTTP status; API v1 turns it into {"detail": ...} (ADR 0011 §2)."""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail
