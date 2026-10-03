from fastapi import APIRouter, Depends

from app.api.github_mock import collaborators, events, orgs
from app.api.github_mock.http import PREFIX, github_headers

router = APIRouter(prefix=PREFIX, dependencies=[Depends(github_headers)])
router.include_router(orgs.router)
router.include_router(collaborators.router)
router.include_router(events.router)
