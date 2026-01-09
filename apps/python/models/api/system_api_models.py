from pydantic import BaseModel


class HealthCheckResponse(BaseModel):
    status: str
    message: str


class StorageInfo(BaseModel):
    total_bytes: int
    used_bytes: int
    free_bytes: int
    used_percentage: float
