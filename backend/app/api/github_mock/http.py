"""HTTP plumbing for the GitHub mock: error format, headers, pagination."""
import math
from collections.abc import Sequence

from fastapi import FastAPI, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.jira_mock.http import PREFIX as JIRA_PREFIX
from app.api.jira_mock.http import jira_validation_response
from app.core.time_provider import get_time_provider

PREFIX = "/api/v3"
DOCS_URL = "https://docs.github.com/rest"
MEDIA_TYPE = "github.v3; format=json"


class GitHubError(Exception):
    def __init__(
        self, status: int, message: str, doc_path: str = "", errors: list[dict[str, str]] | None = None
    ) -> None:
        self.status = status
        self.message = message
        self.doc_path = doc_path
        self.errors = errors


def base_headers(request: Request) -> dict[str, str]:
    # Exception handlers run outside Depends, so honour dependency overrides (tests) by hand.
    provider = request.app.dependency_overrides.get(get_time_provider, get_time_provider)
    now = int(provider().get_current_time().timestamp())
    return {
        "X-GitHub-Media-Type": MEDIA_TYPE,
        "X-RateLimit-Limit": "5000",
        "X-RateLimit-Remaining": "4999",
        "X-RateLimit-Reset": str(now + 3600),
        "X-RateLimit-Resource": "core",
    }


async def github_headers(request: Request, response: Response) -> None:
    response.headers.update(base_headers(request))


def _doc_url(path: str = "") -> str:
    return f"{DOCS_URL}/{path}".rstrip("/")


async def _github_error_handler(request: Request, exc: GitHubError) -> JSONResponse:
    body: dict[str, object] = {"message": exc.message}
    if exc.errors:
        body["errors"] = exc.errors
    body["documentation_url"] = _doc_url(exc.doc_path)
    return JSONResponse(body, status_code=exc.status, headers=base_headers(request))


async def _validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    if request.url.path.startswith(JIRA_PREFIX):
        return jira_validation_response(exc)
    if not request.url.path.startswith(PREFIX):
        from fastapi.exception_handlers import request_validation_exception_handler

        return await request_validation_exception_handler(request, exc)
    errors = [
        {"resource": "Request", "field": ".".join(str(p) for p in e["loc"][1:]) or str(e["loc"][0]), "code": "invalid"}
        for e in exc.errors()
    ]
    body = {"message": "Validation Failed", "errors": errors, "documentation_url": _doc_url()}
    return JSONResponse(body, status_code=422, headers=base_headers(request))


def register_github_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(GitHubError, _github_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, _validation_handler)  # type: ignore[arg-type]


class PageParams:
    def __init__(self, per_page: int = Query(30, ge=1, le=100), page: int = Query(1, ge=1)) -> None:
        self.per_page = per_page
        self.page = page


def paginate[T](items: Sequence[T], request: Request, response: Response, params: PageParams) -> list[T]:
    total_pages = max(1, math.ceil(len(items) / params.per_page))

    def link(page: int, rel: str) -> str:
        url = request.url.include_query_params(page=page, per_page=params.per_page)
        return f'<{url}>; rel="{rel}"'

    links: list[str] = []
    if params.page > 1:
        links += [link(params.page - 1, "prev"), link(1, "first")]
    if params.page < total_pages:
        links += [link(params.page + 1, "next"), link(total_pages, "last")]
    if links:
        response.headers["Link"] = ", ".join(links)
    start = (params.page - 1) * params.per_page
    return list(items[start : start + params.per_page])
