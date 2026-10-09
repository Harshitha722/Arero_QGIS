import copy
import stat
import tempfile
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import Any

import geopandas as gpd
from fiona.errors import FionaError
from pyproj import CRS

from app.services.measurement_service import process_geodataframe


MAX_UPLOAD_BYTES = 50 * 1024 * 1024
MAX_EXTRACTED_BYTES = 200 * 1024 * 1024
MAX_ARCHIVE_MEMBERS = 2000
SHAPEFILE_REQUIRED_EXTENSIONS = {".shp", ".shx", ".dbf"}
KML_GEOMETRY_ELEMENTS = {"Point", "LineString", "Polygon"}


class FileProcessingError(ValueError):
    pass


def _safe_extract_shapefile(archive_path: Path, destination: Path) -> Path:
    try:
        archive = zipfile.ZipFile(archive_path)
    except (zipfile.BadZipFile, OSError) as error:
        raise FileProcessingError("The uploaded ZIP file is corrupt or unreadable") from error

    with archive:
        members = archive.infolist()
        if len(members) > MAX_ARCHIVE_MEMBERS:
            raise FileProcessingError("ZIP archive contains too many files")

        declared_size = sum(member.file_size for member in members if not member.is_dir())
        if declared_size > MAX_EXTRACTED_BYTES:
            raise FileProcessingError("ZIP archive expands beyond the allowed size")

        extracted_size = 0
        extracted_paths: list[Path] = []
        root = destination.resolve()
        seen_paths: set[str] = set()

        for member in members:
            normalized_name = member.filename.replace("\\", "/")
            member_path = PurePosixPath(normalized_name)
            if (
                not normalized_name
                or "\x00" in normalized_name
                or member_path.is_absolute()
                or PureWindowsPath(member.filename).drive
                or any(part in {"", ".", ".."} for part in member_path.parts)
            ):
                raise FileProcessingError("ZIP archive contains an unsafe file path")

            mode = member.external_attr >> 16
            if stat.S_ISLNK(mode):
                raise FileProcessingError("ZIP archive contains a symbolic link")

            output_path = (destination / Path(*member_path.parts)).resolve()
            if output_path != root and root not in output_path.parents:
                raise FileProcessingError("ZIP archive contains an unsafe file path")

            relative_key = member_path.as_posix().casefold()
            if relative_key in seen_paths:
                raise FileProcessingError("ZIP archive contains duplicate file paths")
            seen_paths.add(relative_key)
            if member.is_dir():
                output_path.mkdir(parents=True, exist_ok=True)
                continue

            output_path.parent.mkdir(parents=True, exist_ok=True)
            try:
                with archive.open(member) as source, output_path.open("wb") as target:
                    while chunk := source.read(64 * 1024):
                        extracted_size += len(chunk)
                        if extracted_size > MAX_EXTRACTED_BYTES:
                            raise FileProcessingError(
                                "ZIP archive expands beyond the allowed size"
                            )
                        target.write(chunk)
            except (
                OSError,
                zipfile.BadZipFile,
                RuntimeError,
                NotImplementedError,
                EOFError,
            ) as error:
                raise FileProcessingError("Could not safely extract ZIP archive") from error
            extracted_paths.append(output_path)

    shapefiles = [path for path in extracted_paths if path.suffix.lower() == ".shp"]
    if not shapefiles:
        raise FileProcessingError("ZIP archive does not contain a Shapefile (.shp)")
    if len(shapefiles) > 1:
        raise FileProcessingError("ZIP archive contains multiple Shapefiles; expected one")

    shapefile = shapefiles[0]
    component_extensions = {
        path.suffix.lower()
        for path in extracted_paths
        if path.parent == shapefile.parent
        and path.stem.casefold() == shapefile.stem.casefold()
    }
    missing = SHAPEFILE_REQUIRED_EXTENSIONS - component_extensions
    if missing:
        missing_names = ", ".join(sorted(missing))
        raise FileProcessingError(f"Shapefile is missing required component(s): {missing_names}")

    return shapefile


def _flatten_kml_placemarks(source_path: Path, destination_path: Path) -> None:
    try:
        root = ET.parse(source_path).getroot()
    except (ET.ParseError, OSError) as error:
        raise FileProcessingError(f"Could not parse KML XML: {error}") from error

    if not isinstance(root.tag, str):
        raise FileProcessingError("KML document has an invalid root element")
    namespace = root.tag.partition("}")[0][1:] if root.tag.startswith("{") else ""

    def local_name(element: ET.Element) -> str:
        return element.tag.rpartition("}")[2]

    def is_kml_element(element: ET.Element, name: str) -> bool:
        if not isinstance(element.tag, str):
            return False
        element_namespace = (
            element.tag.partition("}")[0][1:]
            if element.tag.startswith("{")
            else ""
        )
        return element_namespace == namespace and local_name(element) == name

    placemarks = [
        element for element in root.iter()
        if is_kml_element(element, "Placemark")
    ]
    supported_placemarks: list[ET.Element] = []
    for placemark in placemarks:
        elements = [placemark]
        elements.extend(
            element
            for element in placemark.iter()
            if element is not placemark
            and not is_kml_element(element, "Placemark")
        )
        if any(
            is_kml_element(element, geometry_name)
            for element in elements
            for geometry_name in KML_GEOMETRY_ELEMENTS
        ):
            supported_placemarks.append(placemark)

    kml_tag = f"{{{namespace}}}kml" if namespace else "kml"
    document_tag = f"{{{namespace}}}Document" if namespace else "Document"
    flattened_root = ET.Element(kml_tag)
    document = ET.SubElement(flattened_root, document_tag)
    for schema in root.iter():
        if is_kml_element(schema, "Schema"):
            document.append(copy.deepcopy(schema))
    for placemark in supported_placemarks:
        document.append(copy.deepcopy(placemark))

    try:
        if namespace:
            ET.register_namespace("", namespace)
        ET.ElementTree(flattened_root).write(
            destination_path,
            encoding="utf-8",
            xml_declaration=True,
        )
    except OSError as error:
        raise FileProcessingError(f"Could not prepare KML features: {error}") from error


def _read_geodataframe(path: Path, file_extension: str) -> tuple[gpd.GeoDataFrame, CRS | None]:
    try:
        if file_extension == ".kml":
            with tempfile.TemporaryDirectory(prefix="geospatial-kml-") as directory:
                flattened_path = Path(directory) / "flattened.kml"
                _flatten_kml_placemarks(path, flattened_path)
                dataframe = gpd.read_file(
                    flattened_path,
                    driver="KML",
                    engine="fiona",
                    enabled_drivers=["KML"],
                    allow_unsupported_drivers=True,
                )
        else:
            dataframe = gpd.read_file(path)
    except (FionaError, OSError, ValueError) as error:
        raise FileProcessingError(
            f"Could not read {file_extension[1:].upper()} data: {error}"
        ) from error

    if dataframe.empty:
        raise FileProcessingError("Uploaded geospatial file contains no features")

    if file_extension == ".kml" and dataframe.crs is None:
        dataframe = dataframe.set_crs(CRS.from_epsg(4326))
    source_crs = CRS.from_user_input(dataframe.crs) if dataframe.crs else None
    return dataframe, source_crs


def process_uploaded_file(filename: str, content: bytes) -> dict[str, Any]:
    extension = Path(PureWindowsPath(filename).name).suffix.lower()
    if extension not in {".kml", ".zip"}:
        raise FileProcessingError("Unsupported file extension. Upload a .kml or .zip file")
    if not content:
        raise FileProcessingError("Uploaded file is empty")
    if len(content) > MAX_UPLOAD_BYTES:
        raise FileProcessingError("Uploaded file exceeds the 50 MB size limit")

    with tempfile.TemporaryDirectory(prefix="geospatial-upload-") as temporary_directory:
        work_directory = Path(temporary_directory)
        if extension == ".kml":
            source_path = work_directory / "upload.kml"
            source_path.write_bytes(content)
        else:
            archive_path = work_directory / "upload.zip"
            archive_path.write_bytes(content)
            source_path = _safe_extract_shapefile(archive_path, work_directory / "extracted")

        dataframe, source_crs = _read_geodataframe(source_path, extension)
        crs, features = process_geodataframe(dataframe, source_crs=source_crs)
        return {"crs": crs, "features": features}
