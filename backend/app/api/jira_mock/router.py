from fastapi import APIRouter

from app.api.jira_mock import audit, issues, projects, roles, users
from app.api.jira_mock.http import PREFIX

router = APIRouter(prefix=PREFIX, tags=["jira-mock"])
router.include_router(projects.router)
router.include_router(roles.router)
router.include_router(users.router)
router.include_router(issues.router)
router.include_router(audit.router)
