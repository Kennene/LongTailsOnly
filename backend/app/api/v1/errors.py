from fastapi import Request
from fastapi.responses import JSONResponse

from app.services.errors import ServiceError


async def service_error_handler(_request: Request, error: Exception) -> JSONResponse:
    assert isinstance(error, ServiceError)
    return JSONResponse({"detail": error.detail}, status_code=error.status_code)
