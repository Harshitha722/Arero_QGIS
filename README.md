# Geospatial File Measurement

Upload a KML file or zipped Shapefile to calculate per-feature polygon areas and line lengths. The FastAPI server serves a browser UI and a JSON API. Processed file metadata and measurements are stored in TiDB Cloud; source files are not retained.

## Run locally

From PowerShell in the repository root:

```powershell
cd server
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000/` for the UI, `http://127.0.0.1:8000/docs` for API documentation, or `http://127.0.0.1:8000/api/health` for the health check.

Database settings are loaded from `server/.env` locally. Add the TiDB password to `DB_PASSWORD` in that ignored file. The configured TiDB `test` database is used, and the service creates its tables automatically when it first connects. Set the same `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, and `DB_DATABASE=test` variables in Vercel's project environment settings; local `.env` files are not deployed. The database user must have table-creation and data read/write privileges on `test`.

## Deploy on Vercel

Create a Vercel project with `server` as its Root Directory. Vercel detects the FastAPI application in `app/main.py`; the function configuration includes the standalone UI at `app/static/index.html`.

## API

### `GET /api/health`

Returns `{"status":"ok"}` when the API can connect to the configured database. Returns HTTP `503` if the database connection or initialization fails.

### `POST /api/files/`

Accepts a multipart form field named `file` with a `.kml` file or a `.zip` containing exactly one Shapefile. Successful responses return HTTP `201` with a generated file ID, metadata, and every processed feature:

```json
{
  "id": "generated-file-id",
  "filename": "sample_survey.kml",
  "feature_count": 1,
  "crs": "EPSG:4326",
  "status": "COMPLETED",
  "features": [
    {
      "index": 0,
      "geometry_type": "Polygon",
      "geometry": {"type": "Polygon", "coordinates": []},
      "properties": {"Name": "Example plot"},
      "source_crs": "EPSG:4326",
      "projected_crs": "EPSG:32644",
      "measurement": 12345.67,
      "unit": "m²",
      "processing_error": null
    }
  ]
}
```

`GET /api/files/{id}/` returns stored metadata, and `GET /api/files/{id}/measurements/` returns stored features. Unsupported extensions, corrupt or empty files, invalid archives, missing Shapefile components, and datasets without features return HTTP `400`. Feature-level geometry or CRS errors are reported on that feature without failing the complete dataset.

## Supported data

- KML (`.kml`)
- A ZIP containing one Shapefile (`.shp`) and its required `.shx` and `.dbf` components; `.prj` is optional
- Point, MultiPoint, LineString, MultiLineString, Polygon, and MultiPolygon geometries

The upload size limit is 50 MB, and ZIP extraction enforces path-safety and expanded-size limits. Measurements use a per-feature UTM projection rather than longitude/latitude coordinates directly. Measurement is not available outside UTM's latitude range (80°S–84°N).
