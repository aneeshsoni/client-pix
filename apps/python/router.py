from fastapi import APIRouter

from api.albums.albums_api import router as albums_router
from api.auth.auth_api import router as auth_router
from api.files.files_api import router as files_router
from api.share_links.share_links_api import router as share_links_router
from api.share_links.share_public_api import router as share_public_router
from api.system.system_api import router as system_router
from api.uploads.uploads_api import router as uploads_router

router = APIRouter(prefix="/api")

router.include_router(system_router)
router.include_router(auth_router)
router.include_router(uploads_router)
router.include_router(albums_router)
router.include_router(share_links_router)
router.include_router(share_public_router)
router.include_router(files_router)
