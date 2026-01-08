from fastapi import APIRouter

from models.api.system_api_models import HealthCheckResponse

router = APIRouter()


@router.get("/system/health", response_model=HealthCheckResponse)
async def health_check():
    return {"status": "healthy", "message": "System is running"}
