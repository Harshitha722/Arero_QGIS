from typing import Any


def file_record_to_dict(record: Any) -> dict[str, Any]:
    return {
        "id": record["id"],
        "filename": record["filename"],
        "feature_count": record["feature_count"],
        "crs": record["crs"],
        "status": record["status"],
    }
