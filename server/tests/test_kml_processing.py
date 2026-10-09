import math

from fastapi.testclient import TestClient

from app.main import app
from app.services.file_service import process_uploaded_file


KML_NAMESPACE = "http://www.opengis.net/kml/2.2"


def _kml(contents: str) -> bytes:
    return (
        f'<kml xmlns="{KML_NAMESPACE}"><Document>{contents}</Document></kml>'
    ).encode("utf-8")


def _point(name: str, longitude: float = 8, latitude: float = 49) -> str:
    return (
        f"<Placemark><name>{name}</name><Point><coordinates>"
        f"{longitude},{latitude},0</coordinates></Point></Placemark>"
    )


def _line(name: str, coordinates: str) -> str:
    return (
        f"<Placemark><name>{name}</name><LineString><coordinates>"
        f"{coordinates}</coordinates></LineString></Placemark>"
    )


def _process(contents: str) -> list[dict]:
    return process_uploaded_file("test.kml", _kml(contents))["features"]


def _current_structure_kml() -> bytes:
    points = f"<Folder>{_point('Point 1')}{_point('Point 2', 8.001)}</Folder>"
    directions = (
        _line("Route", "8,49,0 8.001,49,0")
        + _line("Continue.", "8.001,49,0 8.002,49.001,0")
        + _line("Go straight ahead.", "8.002,49.001,0 8.003,49.002,0")
        + _line("Keep slightly right.", "8.003,49.002,0 8.004,49.003,0")
        + (
            '<Placemark><name>Turn right into Haid-und-Neu-Straße.</name>'
            '<ExtendedData><Data name="length"><value>999999</value></Data>'
            "</ExtendedData><LineString><coordinates>"
            "8.004,49.003,0 8.005,49.004,0"
            "</coordinates></LineString></Placemark>"
        )
    )
    return _kml(f"{points}<Document>{directions}</Document>")


def test_kml_containing_only_points_has_no_measurements() -> None:
    features = _process(_point("One") + _point("Two", 8.001))

    assert len(features) == 2
    assert [feature["geometry_type"] for feature in features] == ["Point", "Point"]
    assert all(feature["measurement"] is None for feature in features)


def test_kml_containing_only_linestrings_calculates_lengths() -> None:
    features = _process(
        _line("First", "8,49,0 8.001,49,0")
        + _line("Second", "8.001,49,0 8.002,49,0")
    )

    assert len(features) == 2
    assert [feature["geometry_type"] for feature in features] == [
        "LineString",
        "LineString",
    ]
    assert all(isinstance(feature["measurement"], float) for feature in features)
    assert all(feature["unit"] == "m" for feature in features)


def test_kml_containing_polygon_linestring_and_point() -> None:
    polygon = (
        "<Placemark><name>Area</name><Polygon><outerBoundaryIs><LinearRing>"
        "<coordinates>8,49,0 8.001,49,0 8.001,49.001,0 8,49,0"
        "</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>"
    )
    features = _process(
        polygon + _line("Path", "8,49,0 8.001,49,0") + _point("Marker")
    )

    assert [feature["geometry_type"] for feature in features] == [
        "Polygon",
        "LineString",
        "Point",
    ]
    assert isinstance(features[0]["measurement"], float)
    assert features[0]["unit"] == "m²"
    assert isinstance(features[1]["measurement"], float)
    assert features[1]["unit"] == "m"
    assert features[2]["measurement"] is None


def test_kml_multi_geometry_is_preserved_and_measured() -> None:
    multipoint = (
        "<MultiGeometry><Point><coordinates>8,49,0</coordinates></Point>"
        "<Point><coordinates>8.001,49,0</coordinates></Point></MultiGeometry>"
    )
    multilinestring = (
        "<MultiGeometry>"
        "<LineString><coordinates>8,49,0 8.001,49,0</coordinates></LineString>"
        "<LineString><coordinates>8.001,49,0 8.002,49,0</coordinates></LineString>"
        "</MultiGeometry>"
    )
    multipolygon = (
        "<MultiGeometry>"
        "<Polygon><outerBoundaryIs><LinearRing><coordinates>"
        "8,49,0 8.001,49,0 8.001,49.001,0 8,49,0"
        "</coordinates></LinearRing></outerBoundaryIs></Polygon>"
        "<Polygon><outerBoundaryIs><LinearRing><coordinates>"
        "8.002,49,0 8.003,49,0 8.003,49.001,0 8.002,49,0"
        "</coordinates></LinearRing></outerBoundaryIs></Polygon>"
        "</MultiGeometry>"
    )
    features = _process(
        f"<Placemark><name>MultiPoint</name>{multipoint}</Placemark>"
        f"<Placemark><name>MultiLineString</name>{multilinestring}</Placemark>"
        f"<Placemark><name>MultiPolygon</name>{multipolygon}</Placemark>"
    )

    assert [feature["geometry_type"] for feature in features] == [
        "MultiPoint",
        "MultiLineString",
        "MultiPolygon",
    ]
    assert features[0]["measurement"] is None
    assert isinstance(features[1]["measurement"], float)
    assert isinstance(features[2]["measurement"], float)


def test_kml_finds_placemarks_inside_folder() -> None:
    features = _process(
        f"<Folder>{_point('Nested point')}"
        f"<Folder>{_line('Nested line', '8,49,0 8.001,49,0')}</Folder>"
        "</Folder>"
    )

    assert [feature["properties"]["Name"] for feature in features] == [
        "Nested point",
        "Nested line",
    ]


def test_kml_finds_placemarks_inside_nested_document() -> None:
    features = _process(
        f"<Document>{_line('Nested route', '8,49,0 8.001,49,0')}</Document>"
    )

    assert len(features) == 1
    assert features[0]["properties"]["Name"] == "Nested route"
    assert features[0]["geometry_type"] == "LineString"


def test_current_kml_structure_finds_all_features_and_measures_lines() -> None:
    result = process_uploaded_file("current.kml", _current_structure_kml())
    features = result["features"]
    geometries = [feature["geometry_type"] for feature in features]
    lines = [feature for feature in features if feature["geometry_type"] == "LineString"]

    assert len(features) == 7
    assert geometries.count("Point") == 2
    assert geometries.count("LineString") == 5
    assert sum(feature["measurement"] is not None for feature in features) == 5
    assert all(
        isinstance(feature["measurement"], (int, float))
        and math.isfinite(feature["measurement"])
        for feature in lines
    )
    assert all(feature["measurement"] != 999999 for feature in lines)
    assert [feature["index"] for feature in features] == list(range(7))
    assert [feature["properties"]["Name"] for feature in lines] == [
        "Route",
        "Continue.",
        "Go straight ahead.",
        "Keep slightly right.",
        "Turn right into Haid-und-Neu-Straße.",
    ]


def test_kml_upload_and_retrieval_endpoints_return_all_features(
    tmp_path, monkeypatch
) -> None:
    monkeypatch.setenv(
        "GEOSPATIAL_DATABASE_PATH", str(tmp_path / "measurements.db")
    )
    with TestClient(app) as client:
        upload = client.post(
            "/api/files/",
            files={
                "file": (
                    "current.kml",
                    _current_structure_kml(),
                    "application/vnd.google-earth.kml+xml",
                )
            },
        )
        assert upload.status_code == 201
        file_record = upload.json()
        assert file_record["feature_count"] == 7

        metadata = client.get(f"/api/files/{file_record['id']}/")
        assert metadata.status_code == 200
        assert metadata.json()["feature_count"] == 7

        measurements = client.get(
            f"/api/files/{file_record['id']}/measurements/"
        )
        assert measurements.status_code == 200
        features = measurements.json()["features"]
        assert len(features) == 7
        assert sum(feature["geometry_type"] == "Point" for feature in features) == 2
        lines = [
            feature for feature in features
            if feature["geometry_type"] == "LineString"
        ]
        assert len(lines) == 5
        assert all(
            isinstance(feature["measurement"], (int, float))
            and math.isfinite(feature["measurement"])
            for feature in lines
        )
