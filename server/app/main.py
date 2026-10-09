from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.routes.files import router as files_router
from app.schemas.file import HealthResponse
from app.utils.database import initialize_database


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    yield


app = FastAPI(
    title="Geospatial File Measurement API",
    description="Upload KML or zipped Shapefiles to calculate per-feature measurements.",
    version="1.0.0",
    lifespan=lifespan,
)
app.include_router(files_router)


@app.get("/api/health", response_model=HealthResponse, tags=["health"])
def health_check() -> dict[str, str]:
    return {"status": "ok"}
