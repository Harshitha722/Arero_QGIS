import uuid
from pathlib import PureWindowsPath

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from app.models.file_record import file_record_to_dict
from app.schemas.file import FileResponse, MeasurementsResponse
from app.services.file_service import (
    MAX_UPLOAD_BYTES,
    FileProcessingError,
    process_uploaded_file,
)
from app.services.storage_service import get_features, get_file, save_processed_file


router = APIRouter(prefix="/api/files", tags=["files"])


@router.post("/", response_model=FileResponse, status_code=status.HTTP_201_CREATED)
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

    file_id = str(uuid.uuid4())
    save_processed_file(file_id, filename, result["crs"], result["features"])
    stored_file = get_file(file_id)
    if stored_file is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="File was processed but could not be retrieved from storage",
        )
    return file_record_to_dict(stored_file)


@router.get("/{file_id}/", response_model=FileResponse)
def read_file(file_id: str) -> dict:
    record = get_file(file_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return file_record_to_dict(record)


@router.get("/{file_id}/measurements/", response_model=MeasurementsResponse)
def read_measurements(file_id: str) -> dict:
    features = get_features(file_id)
    if features is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return {"file_id": file_id, "features": features}
