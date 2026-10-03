"""Separate Swagger page for the GitHub and Jira mocks (`/mocks/docs`).

The mocks stay mounted on the main app under their real paths, but are hidden from `/docs`,
so the product API and the fake external systems are documented on two different pages.
"""
from typing import Any

from fastapi import APIRouter
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from fastapi.responses import HTMLResponse

from app.api.github_mock.router import router as github_mock_router
from app.api.jira_mock.router import router as jira_mock_router

MOCK_DOCS_URL = "/mocks/docs"
MOCK_OPENAPI_URL = "/mocks/openapi.json"

MOCK_TAGS = [
    {"name": "GitHub · Organizacja i repozytoria", "description": "Członkowie, zespoły i repozytoria organizacji `longtails`."},
    {"name": "GitHub · Dostęp do repozytoriów", "description": "Collaboratorzy: odczyt, nadanie i odebranie uprawnień (= dzierżawa)."},
    {"name": "GitHub · Zdarzenia", "description": "Strumień aktywności repozytorium."},
    {"name": "Jira · Projekty", "description": "Projekty Jiry (1:1 z repozytoriami)."},
    {"name": "Jira · Role projektowe", "description": "Role projektowe i ich aktorzy: odczyt i zapis."},
    {"name": "Jira · Użytkownicy i grupy", "description": "Konta użytkowników i grupy (zespoły)."},
    {"name": "Jira · Zgłoszenia", "description": "Wyszukiwanie JQL, zgłoszenia, historia zmian i komentarze."},
    {"name": "Jira · Audyt", "description": "Rekordy dziennika audytu Jiry."},
]

MAIN_DESCRIPTION = f"API produktu. Mocki GitHuba i Jiry mają osobną stronę: [{MOCK_DOCS_URL}]({MOCK_DOCS_URL})."
MOCK_DESCRIPTION = (
    "Udawane API zewnętrznych systemów: GitHub REST v3 (`/api/v3`) i Jira Cloud REST v3 (`/rest/api/3`). "
    "API produktu: [/docs](/docs)."
)

router = APIRouter(include_in_schema=False)
_schema: dict[str, Any] = {}


@router.get(MOCK_OPENAPI_URL)
async def mock_openapi() -> dict[str, Any]:
    if not _schema:
        _schema.update(
            get_openapi(
                title="LongTailsOnly: mocki GitHub i Jira",
                version="1.0.0",
                description=MOCK_DESCRIPTION,
                routes=[*github_mock_router.routes, *jira_mock_router.routes],
                tags=MOCK_TAGS,
            )
        )
    return _schema


@router.get(MOCK_DOCS_URL)
async def mock_swagger_ui() -> HTMLResponse:
    return get_swagger_ui_html(openapi_url=MOCK_OPENAPI_URL, title="LongTailsOnly: mocki - Swagger UI")
