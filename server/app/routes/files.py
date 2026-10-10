import logging
import uuid
from pathlib import PureWindowsPath

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from pymysql import MySQLError

from app.schemas.file import (
    FeatureResponse,
    FileResponse,
    MeasurementsResponse,
    UploadResponse,
)
from app.services.file_service import (
    MAX_UPLOAD_BYTES,
    FileProcessingError,
    process_uploaded_file,
)
from app.services.storage_service import get_features, get_file, save_processed_file


router = APIRouter(prefix="/api/files", tags=["files"])
logger = logging.getLogger(__name__)


def _database_error_detail(error: MySQLError | RuntimeError, action: str) -> str:
    error_code = error.args[0] if isinstance(error, MySQLError) and error.args else None
    if error_code == 1049:
        return (
            "The configured database does not exist. Create the application database "
            "in TiDB Cloud or set DB_DATABASE to an existing database."
        )
    if error_code == 1045:
        return "The database rejected the configured credentials. Check DB_USERNAME and DB_PASSWORD."
    if error_code == 1044:
        return "The database user cannot access DB_DATABASE. Check the database name and user grants."
    if error_code in {2002, 2003, 2006, 2013}:
        return "The database server could not be reached or the connection was lost. Check DB_HOST, DB_PORT, TiDB availability, and network access."
    if error_code == 1142:
        return (
            "The database user cannot create tables in this schema. "
            "Select an application database and grant it CREATE privileges."
        )
    if error_code is not None:
        return f"Could not {action} in the database (MySQL error {error_code}). Check the server log for details."
    return f"Could not {action} in the database. Check the database configuration and try again."


@router.post("/", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(file: UploadFile = File(...)) -> dict:
    filename = PureWindowsPath(file.filename or "").name
    extension = PureWindowsPath(filename).suffix.lower()
    if extension not in {".kml", ".zip"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file extension. Upload a .kml or .zip file",
        )

    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file exceeds the 50 MB size limit",
        )
    try:
        result = process_uploaded_file(filename, content)
    except FileProcessingError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)
        ) from error

    features = [FeatureResponse.model_validate(feature) for feature in result["features"]]
    file_id = str(uuid.uuid4())
    try:
        save_processed_file(file_id, filename, result["crs"], [item.model_dump() for item in features])
    except (MySQLError, RuntimeError) as error:
        error_code = error.args[0] if isinstance(error, MySQLError) and error.args else "configuration"
        logger.error("Database save failed (%s)", error_code)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_database_error_detail(error, "save the processed file"),
        ) from error

    return {
        "id": file_id,
        "filename": filename,
        "feature_count": len(features),
        "crs": result["crs"],
        "status": "COMPLETED",
        "features": features,
    }


@router.get("/{file_id}/", response_model=FileResponse)
def read_file(file_id: str) -> dict:
    try:
        record = get_file(file_id)
    except (MySQLError, RuntimeError) as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_database_error_detail(error, "read file information"),
        ) from error
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return record


@router.get("/{file_id}/measurements/", response_model=MeasurementsResponse)
def read_measurements(file_id: str) -> dict:
    try:
        features = get_features(file_id)
    except (MySQLError, RuntimeError) as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_database_error_detail(error, "read measurements"),
        ) from error
    if features is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return {"file_id": file_id, "features": features}
