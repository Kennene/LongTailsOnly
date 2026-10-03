"""Separate Swagger pages for the GitHub mock (`/mocks/github/docs`) and the Jira mock (`/mocks/jira/docs`).

The mocks stay mounted on the main app under their real paths, but are hidden from `/docs`,
so the product API and each fake external system are documented on their own page.
"""
from dataclasses import dataclass
from typing import Any

from fastapi import APIRouter
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from fastapi.responses import HTMLResponse
from fastapi.routing import BaseRoute

from app.api.github_mock.router import router as github_mock_router
from app.api.jira_mock.router import router as jira_mock_router


@dataclass(frozen=True)
class MockDocs:
    slug: str
    title: str
    description: str
    routes: list[BaseRoute]
    tags: list[dict[str, str]]

    @property
    def docs_url(self) -> str:
        return f"/mocks/{self.slug}/docs"

    @property
    def openapi_url(self) -> str:
        return f"/mocks/{self.slug}/openapi.json"


GITHUB_DOCS = MockDocs(
    slug="github",
    title="LongTailsOnly: mock GitHuba",
    description="Udawane GitHub REST API v3 (`/api/v3`). API produktu: [/docs](/docs).",
    routes=github_mock_router.routes,
    tags=[
        {"name": "GitHub · Organizacja i repozytoria", "description": "Członkowie, zespoły i repozytoria organizacji `longtails`."},
        {"name": "GitHub · Dostęp do repozytoriów", "description": "Collaboratorzy: odczyt, nadanie i odebranie uprawnień (= dzierżawa)."},
        {"name": "GitHub · Zdarzenia", "description": "Strumień aktywności repozytorium."},
    ],
)

JIRA_DOCS = MockDocs(
    slug="jira",
    title="LongTailsOnly: mock Jiry",
    description="Udawane Jira Cloud REST API v3 (`/rest/api/3`). API produktu: [/docs](/docs).",
    routes=jira_mock_router.routes,
    tags=[
        {"name": "Jira · Projekty", "description": "Projekty Jiry (1:1 z repozytoriami)."},
        {"name": "Jira · Role projektowe", "description": "Role projektowe i ich aktorzy: odczyt i zapis."},
        {"name": "Jira · Użytkownicy i grupy", "description": "Konta użytkowników i grupy (zespoły)."},
        {"name": "Jira · Zgłoszenia", "description": "Wyszukiwanie JQL, zgłoszenia, historia zmian i komentarze."},
        {"name": "Jira · Audyt", "description": "Rekordy dziennika audytu Jiry."},
    ],
)

MAIN_DESCRIPTION = (
    "API produktu. Mocki mają osobne strony: "
    f"GitHub [{GITHUB_DOCS.docs_url}]({GITHUB_DOCS.docs_url}), "
    f"Jira [{JIRA_DOCS.docs_url}]({JIRA_DOCS.docs_url})."
)

router = APIRouter(include_in_schema=False)


def _register(docs: MockDocs) -> None:
    schema: dict[str, Any] = {}

    async def openapi() -> dict[str, Any]:
        if not schema:
            schema.update(
                get_openapi(
                    title=docs.title,
                    version="1.0.0",
                    description=docs.description,
                    routes=docs.routes,
                    tags=docs.tags,
                )
            )
        return schema

    async def swagger_ui() -> HTMLResponse:
        return get_swagger_ui_html(openapi_url=docs.openapi_url, title=f"{docs.title} - Swagger UI")

    router.add_api_route(docs.openapi_url, openapi, methods=["GET"])
    router.add_api_route(docs.docs_url, swagger_ui, methods=["GET"])


_register(GITHUB_DOCS)
_register(JIRA_DOCS)
