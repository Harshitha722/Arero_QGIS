import os
import sqlite3
from pathlib import Path


DEFAULT_DATABASE_PATH = Path(__file__).resolve().parents[2] / "data" / "measurements.db"


def get_database_path() -> Path:
    configured_path = os.getenv("GEOSPATIAL_DATABASE_PATH")
    return Path(configured_path) if configured_path else DEFAULT_DATABASE_PATH


def get_connection() -> sqlite3.Connection:
    database_path = get_database_path()
    database_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database() -> None:
    with get_connection() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS files (
                id TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                feature_count INTEGER NOT NULL DEFAULT 0,
                crs TEXT,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS features (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
                feature_index INTEGER NOT NULL,
                geometry_type TEXT,
                geometry_json TEXT,
                properties_json TEXT NOT NULL,
                source_crs TEXT,
                projected_crs TEXT,
                measurement REAL,
                unit TEXT,
                processing_error TEXT,
                UNIQUE(file_id, feature_index)
            );
            """
        )
