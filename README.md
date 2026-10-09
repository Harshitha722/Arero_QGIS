# Geospatial File Measurement API

## Project Overview
This backend accepts KML files and zipped Shapefiles, detects their geographic features, and calculates polygon areas and line lengths. Results are stored locally in SQLite and returned through a REST API.

## Architecture

```text
server/
├── app/
│   ├── main.py                 # FastAPI app and health endpoint
│   ├── routes/files.py         # File upload and retrieval endpoints
│   ├── services/file_service.py
│   ├── services/measurement_service.py
│   ├── services/storage_service.py
│   ├── models/                 # Database record mapping
│   ├── schemas/                # API response schemas
│   └── utils/database.py       # SQLite connection and schema setup
├── tests/
├── requirements.txt
└── data/                       # SQLite database, created at runtime
```

Routes handle HTTP requests, file services validate and parse uploads, measurement services handle geometries and CRS, and storage services persist and retrieve processed results. The React/Vite frontend in `client/` provides uploads, an interactive Leaflet map, feature details, a measurement table, and area charts.

## Backend Setup

Run these commands in PowerShell from the repository root:

```powershell
cd server
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API runs at `http://127.0.0.1:8000`. Interactive API documentation is available at `http://127.0.0.1:8000/docs`.

To run the tests from `server/`:

```powershell
python -m pytest
```

The default SQLite database is created at `server/data/measurements.db` when the application starts. Set `GEOSPATIAL_DATABASE_PATH` to use a different database file.

## React Frontend

The React/Vite frontend is in `client/` and communicates with the FastAPI backend. Start the backend separately, then run these commands from the repository root:

```powershell
cd client
npm install
npm run dev
```

During local development, Vite proxies `/api` requests to `http://localhost:8000`, avoiding a browser CORS requirement. To use a different local backend, set `VITE_API_PROXY_TARGET` before starting Vite:

```powershell
$env:VITE_API_PROXY_TARGET = "http://localhost:8000"
npm run dev
```

For a separately hosted frontend, set `VITE_API_BASE_URL` to the API origin and configure that backend/deployment to allow the frontend origin or provide a same-origin reverse proxy. The map renders API geometries, and selecting a feature either on the map or in the table updates the shared selection, highlighted map feature, and details panel. Polygon area charts are generated from returned area measurements.

## Dependencies

Frontend:
- React and Vite for the client application
- Leaflet and React-Leaflet for interactive mapping
- proj4 for converting supported source CRS coordinates for map display
- Recharts for polygon area visualization

Backend:
- FastAPI and Uvicorn for the REST API
- GeoPandas and Fiona for reading spatial datasets
- Shapely for geometry operations
- pyproj for CRS transformations
- python-multipart for multipart file uploads
- pytest and HTTPX for backend tests

## API Endpoints

### `GET /api/health`

Checks that the API is available.

```json
{"status": "ok"}
```

### `POST /api/files/`

Upload a `.kml` file or a `.zip` containing exactly one Shapefile. Example using PowerShell:

```powershell
curl.exe -F "file=@sample_survey.kml" http://127.0.0.1:8000/api/files/
```

Successful upload response (`201 Created`):

```json
{
  "id": "generated-file-id",
  "filename": "sample_survey.kml",
  "feature_count": 5,
  "crs": "EPSG:4326",
  "status": "COMPLETED"
}
```

### `GET /api/files/{id}/`

Returns the uploaded file's metadata, feature count, source CRS, and processing status.

```json
{
  "id": "generated-file-id",
  "filename": "sample_survey.kml",
  "feature_count": 5,
  "crs": "EPSG:4326",
  "status": "COMPLETED"
}
```

### `GET /api/files/{id}/measurements/`

Returns every feature with its geometry in GeoJSON-compatible form, original properties, source and projected CRS, measurement, unit, and any feature-level processing error. Polygon measurements use `m²`; line measurements use `m`; points have a null measurement and unit.

```json
{
  "file_id": "generated-file-id",
  "features": [
    {
      "index": 0,
      "geometry_type": "Polygon",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[79.0, 11.0], [79.001, 11.0], [79.001, 11.001], [79.0, 11.0]]]
      },
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

## Supported Files and Geometries

- KML (`.kml`)
- One Shapefile (`.shp`) and its required `.shx` and `.dbf` components inside a ZIP. The `.prj` component is optional; if it is absent, the CRS is treated as unknown.
- Point, MultiPoint, LineString, MultiLineString, Polygon, and MultiPolygon

KML Placemarks are discovered throughout nested `Document` and `Folder` containers. Supported geometries and Placemark properties are retained, and line lengths and polygon areas are calculated from their geometries.

KML uses the standard WGS 84 coordinate system (EPSG:4326) if the file reader does not report a CRS. Shapefile attributes and KML feature properties are retained. Null, empty, invalid, and unsupported geometries are returned with a `processing_error`; one such feature does not stop processing the others.

ZIP extraction rejects unsafe paths and symbolic links and enforces upload and extraction size limits.

## CRS and Measurement Method

Measurements are never calculated directly on longitude/latitude coordinates. Each measurable feature is transformed to EPSG:4326 to find a representative point, then assigned the UTM zone for that location: EPSG:326xx in the northern hemisphere or EPSG:327xx in the southern hemisphere. The geometry is reprojected into that projected CRS before calculating planar area or length.

This per-feature UTM strategy is suitable for local and regional data. The initial implementation does not calculate measurements outside UTM's latitude range (80°S–84°N). A missing Shapefile CRS is reported as unknown and its polygon/line measurements are left null rather than guessed. Points are retained but are not measured.

## Data Flow and Error Handling

The upload endpoint validates the extension and file size, safely extracts ZIP contents when needed, and reads features with GeoPandas. Each feature is serialized, checked, and measured independently. The file metadata and all feature results are then saved together in SQLite before the API returns the new file ID.

Unsupported extensions, corrupt or empty inputs, invalid archives, missing Shapefile components, and datasets with no features return a clear HTTP 400 response. Unknown file IDs return HTTP 404. Feature-level geometry or CRS problems are represented in that feature's result rather than failing the complete dataset.

## Current Status

Backend upload, geospatial processing, SQLite storage, API endpoints, and the React frontend are implemented. The frontend supports KML and zipped Shapefile uploads, map rendering, feature selection, measurement details, and polygon area charts.