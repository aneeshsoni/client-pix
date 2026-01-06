from fastapi import APIRouter

from api.albums import albums_api
from api.system import system_api
from api.uploads import uploads_api

router = APIRouter(prefix="/api")

router.include_router(system_api.router)
router.include_router(uploads_api.router)
router.include_router(albums_api.router)
