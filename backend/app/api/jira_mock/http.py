"""HTTP plumbing for the Jira mock: error format and pagination (ADR 0011).

Validation errors under `/rest/api/3` are rendered by `jira_validation_response`; the single
RequestValidationError handler lives in the GitHub mock's `http.py`, which delegates by path prefix.
"""
from collections.abc import Sequence
from typing import Any

from fastapi import FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

PREFIX = "/rest/api/3"
MAX_RESULTS = 100


class JiraError(Exception):
    def __init__(self, status: int, *messages: str, errors: dict[str, str] | None = None) -> None:
        self.status = status
        self.messages = list(messages)
        self.errors = errors or {}


def _body(messages: list[str], errors: dict[str, str]) -> dict[str, Any]:
    return {"errorMessages": messages, "errors": errors}


async def _jira_error_handler(_request: Request, exc: JiraError) -> JSONResponse:
    return JSONResponse(_body(exc.messages, exc.errors), status_code=exc.status)


def jira_validation_response(exc: RequestValidationError) -> JSONResponse:
    errors = {
        ".".join(str(p) for p in e["loc"][1:]) or str(e["loc"][0]): str(e["msg"]) for e in exc.errors()
    }
    return JSONResponse(_body([], errors), status_code=400)


def register_jira_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(JiraError, _jira_error_handler)  # type: ignore[arg-type]


class PageParams:
    """`startAt` / `maxResults` like Jira; an oversized maxResults is clamped, not rejected."""

    def __init__(
        self,
        start_at: int = Query(0, alias="startAt", ge=0),
        max_results: int = Query(50, alias="maxResults", ge=0),
    ) -> None:
        self.start_at = start_at
        self.max_results = min(max_results, MAX_RESULTS)


def page[T](items: Sequence[T], params: PageParams, key: str = "values") -> dict[str, Any]:
    window = list(items[params.start_at : params.start_at + params.max_results])
    return {
        "startAt": params.start_at,
        "maxResults": params.max_results,
        "total": len(items),
        "isLast": params.start_at + len(window) >= len(items),
        key: window,
    }
