import proj4 from "proj4";

const SUPPORTED_GEOMETRIES = new Set([
  "Point",
  "MultiPoint",
  "LineString",
  "MultiLineString",
  "Polygon",
  "MultiPolygon",
]);

function normalizeCrs(crs) {
  if (!crs) return null;
  const text = String(crs).trim().toUpperCase();
  const epsg = text.match(/EPSG\s*:\s*(\d+)/) || text.match(/\/(\d+)$/);
  if (epsg) return `EPSG:${epsg[1]}`;
  return text;
}

function definitionFor(crs) {
  const normalized = normalizeCrs(crs);
  if (!normalized) return null;

  if (normalized === "EPSG:4326" || normalized === "OGC:CRS84") {
    return "EPSG:4326";
  }
  if (normalized === "EPSG:3857" || normalized === "EPSG:900913") {
    return "EPSG:3857";
  }

  const utm = normalized.match(/^EPSG:(326|327)(\d{2})$/);
  if (utm) {
    const zone = Number(utm[2]);
    if (zone >= 1 && zone <= 60) {
      const hemisphere = utm[1] === "326" ? "north" : "south";
      const south = hemisphere === "south" ? " +south" : "";
      return `+proj=utm +zone=${zone}${south} +datum=WGS84 +units=m +no_defs`;
    }
  }

  return normalized.startsWith("+proj=") ? normalized : null;
}

function transformCoordinates(coordinates, transformPosition) {
  if (
    Array.isArray(coordinates) &&
    coordinates.length >= 2 &&
    typeof coordinates[0] === "number" &&
    typeof coordinates[1] === "number"
  ) {
    return transformPosition(coordinates);
  }
  if (Array.isArray(coordinates)) {
    return coordinates.map((coordinate) =>
      transformCoordinates(coordinate, transformPosition),
    );
  }
  return coordinates;
}

export function geometryToWgs84(geometry, sourceCrs) {
  if (!geometry || !SUPPORTED_GEOMETRIES.has(geometry.type)) return null;
  const source = definitionFor(sourceCrs);
  if (!source) return null;
  if (source === "EPSG:4326") return geometry;

  return {
    ...geometry,
    coordinates: transformCoordinates(geometry.coordinates, (position) => {
      const [longitude, latitude] = proj4(source, "EPSG:4326", position);
      return position.length > 2
        ? [longitude, latitude, ...position.slice(2)]
        : [longitude, latitude];
    }),
  };
}

export function featureToWgs84(feature) {
  const geometry = geometryToWgs84(feature.geometry, feature.source_crs);
  if (!geometry) return null;
  return {
    type: "Feature",
    properties: feature.properties || {},
    geometry,
  };
}

export function featureCollectionToWgs84(features) {
  return {
    type: "FeatureCollection",
    features: features.map(featureToWgs84).filter(Boolean),
  };
}

export function getGeometryBounds(geometry) {
  const positions = [];
  const visit = (value) => {
    if (
      Array.isArray(value) &&
      value.length >= 2 &&
      typeof value[0] === "number" &&
      typeof value[1] === "number" &&
      Number.isFinite(value[0]) &&
      Number.isFinite(value[1])
    ) {
      positions.push([value[1], value[0]]);
    } else if (Array.isArray(value)) {
      value.forEach(visit);
    }
  };
  visit(geometry?.coordinates);
  if (positions.length === 0) return null;

  const latitudes = positions.map(([latitude]) => latitude);
  const longitudes = positions.map(([, longitude]) => longitude);
  return [
    [Math.min(...latitudes), Math.min(...longitudes)],
    [Math.max(...latitudes), Math.max(...longitudes)],
  ];
}
