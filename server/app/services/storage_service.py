import json
import sqlite3
from typing import Any

from app.utils.database import get_connection


def save_processed_file(
    file_id: str,
    filename: str,
    crs: str | None,
    features: list[dict[str, Any]],
) -> None:
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO files (id, filename, feature_count, crs, status)
            VALUES (?, ?, ?, ?, ?)
            """,
            (file_id, filename, len(features), crs, "COMPLETED"),
        )
        connection.executemany(
            """
            INSERT INTO features (
                file_id, feature_index, geometry_type, geometry_json,
                properties_json, source_crs, projected_crs, measurement, unit,
                processing_error
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    file_id,
                    feature["index"],
                    feature["geometry_type"],
                    json.dumps(feature["geometry"], allow_nan=False),
                    json.dumps(feature["properties"], allow_nan=False),
                    feature["source_crs"],
                    feature["projected_crs"],
                    feature["measurement"],
                    feature["unit"],
                    feature["processing_error"],
                )
                for feature in features
            ],
        )


def get_file(file_id: str) -> sqlite3.Row | None:
    with get_connection() as connection:
        return connection.execute(
            """
            SELECT id, filename, feature_count, crs, status
            FROM files WHERE id = ?
            """,
            (file_id,),
        ).fetchone()


def get_features(file_id: str) -> list[dict[str, Any]] | None:
    with get_connection() as connection:
        if connection.execute(
            "SELECT 1 FROM files WHERE id = ?", (file_id,)
        ).fetchone() is None:
            return None

        records = connection.execute(
            """
            SELECT feature_index, geometry_type, geometry_json, properties_json,
                   source_crs, projected_crs, measurement, unit, processing_error
            FROM features WHERE file_id = ? ORDER BY feature_index
            """,
            (file_id,),
        ).fetchall()

    return [
        {
            "index": record["feature_index"],
            "geometry_type": record["geometry_type"],
            "geometry": json.loads(record["geometry_json"])
            if record["geometry_json"] is not None
            else None,
            "properties": json.loads(record["properties_json"]),
            "source_crs": record["source_crs"],
            "projected_crs": record["projected_crs"],
            "measurement": record["measurement"],
            "unit": record["unit"],
            "processing_error": record["processing_error"],
        }
        for record in records
    ]
