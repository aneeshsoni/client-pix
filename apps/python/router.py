from fastapi import APIRouter

from api.system import system_api

router = APIRouter(prefix="/api")

router.include_router(system_api.router)
