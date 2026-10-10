import json
import os
import ssl
from pathlib import Path
from typing import Any

import certifi
import pymysql
from dotenv import load_dotenv
from pymysql.connections import Connection
from pymysql.cursors import DictCursor


load_dotenv(Path(__file__).resolve().parents[2] / ".env")


def get_connection() -> Connection:
    db_host = os.getenv("DB_HOST")
    db_username = os.getenv("DB_USERNAME")
    db_password = os.getenv("DB_PASSWORD")
    db_database = os.getenv("DB_DATABASE")
    missing_settings = [
        name
        for name, value in (
            ("DB_HOST", db_host),
            ("DB_USERNAME", db_username),
            ("DB_PASSWORD", db_password),
            ("DB_DATABASE", db_database),
        )
        if not value
    ]
    if missing_settings:
        raise RuntimeError(
            "Missing database configuration: " + ", ".join(missing_settings)
        )

    try:
        db_port = int(os.getenv("DB_PORT", "4000"))
    except ValueError as error:
        raise RuntimeError("DB_PORT must be a valid integer") from error
    if not 1 <= db_port <= 65535:
        raise RuntimeError("DB_PORT must be between 1 and 65535")

    assert db_host is not None
    assert db_username is not None
    assert db_password is not None
    assert db_database is not None
    return pymysql.connect(
        host=db_host,
        port=db_port,
        user=db_username,
        password=db_password,
        database=db_database,
        charset="utf8mb4",
        cursorclass=DictCursor,
        connect_timeout=10,
        ssl=ssl.create_default_context(cafile=certifi.where()),
    )


def initialize_database(connection: Connection) -> None:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS files (
                id CHAR(36) PRIMARY KEY,
                filename VARCHAR(512) NOT NULL,
                feature_count INT NOT NULL,
                crs VARCHAR(2048) NULL,
                status VARCHAR(32) NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS features (
                file_id CHAR(36) NOT NULL,
                feature_index INT NOT NULL,
                geometry_type VARCHAR(64) NULL,
                geometry JSON NULL,
                map_geometry JSON NULL,
                map_error TEXT NULL,
                properties JSON NOT NULL,
                source_crs VARCHAR(2048) NULL,
                projected_crs VARCHAR(2048) NULL,
                measurement DOUBLE NULL,
                unit VARCHAR(16) NULL,
                processing_error TEXT NULL,
                PRIMARY KEY (file_id, feature_index),
                CONSTRAINT features_file_fk
                    FOREIGN KEY (file_id) REFERENCES files(id)
                    ON DELETE CASCADE
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
            """
        )

        # CREATE TABLE IF NOT EXISTS does not update columns on existing databases.
        # Widen these metadata fields to support long upload names and custom CRS text.
        cursor.execute(
            """
            SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND ((TABLE_NAME = 'files' AND COLUMN_NAME IN ('filename', 'crs'))
                OR (TABLE_NAME = 'features' AND COLUMN_NAME IN ('source_crs', 'projected_crs')))
            """
        )
        column_lengths = {
            (row["TABLE_NAME"], row["COLUMN_NAME"]): (
                row["DATA_TYPE"].lower(), row["CHARACTER_MAXIMUM_LENGTH"]
            )
            for row in cursor.fetchall()
        }
        widened_columns = {
            ("files", "filename"): (512, "NOT NULL"),
            ("files", "crs"): (2048, "NULL"),
            ("features", "source_crs"): (2048, "NULL"),
            ("features", "projected_crs"): (2048, "NULL"),
        }
        for (table_name, column_name), (length, nullability) in widened_columns.items():
            data_type, current_length = column_lengths.get((table_name, column_name), ("", 0))
            if data_type != "varchar" or current_length is None or current_length < length:
                cursor.execute(
                    f"ALTER TABLE `{table_name}` MODIFY COLUMN `{column_name}` VARCHAR({length}) {nullability}"
                )


def decode_json_value(value: Any) -> Any:
    if isinstance(value, (bytes, bytearray)):
        value = value.decode("utf-8")
    if isinstance(value, str):
        return json.loads(value)
    return value
