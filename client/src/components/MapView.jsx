import { useEffect, useMemo } from "react";
import L from "leaflet";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";

import {
  featureToWgs84,
  getGeometryBounds,
} from "../utils/geo.js";

function MapViewport({ collection, selectedFeature, datasetKey }) {
  const map = useMap();

  useEffect(() => {
    const selectedGeoJson = selectedFeature
      ? featureToWgs84(selectedFeature)
      : null;
    const selectedBounds = selectedGeoJson
      ? getGeometryBounds(selectedGeoJson.geometry)
      : null;

    if (selectedBounds) {
      if (
        selectedBounds[0][0] === selectedBounds[1][0] &&
        selectedBounds[0][1] === selectedBounds[1][1]
      ) {
        map.flyTo(selectedBounds[0], 16);
      } else {
        map.flyToBounds(selectedBounds, { padding: [38, 38], maxZoom: 16 });
      }
      return;
    }

    const bounds = collection.features.reduce((combined, feature) => {
      const featureBounds = getGeometryBounds(feature.geometry);
      if (!featureBounds) return combined;
      if (!combined) return featureBounds;
      return [
        [
          Math.min(combined[0][0], featureBounds[0][0]),
          Math.min(combined[0][1], featureBounds[0][1]),
        ],
        [
          Math.max(combined[1][0], featureBounds[1][0]),
          Math.max(combined[1][1], featureBounds[1][1]),
        ],
      ];
    }, null);

    if (bounds) {
      if (bounds[0][0] === bounds[1][0] && bounds[0][1] === bounds[1][1]) {
        map.setView(bounds[0], 14);
      } else {
        map.fitBounds(bounds, { padding: [38, 38], maxZoom: 14 });
      }
    }
  }, [collection, datasetKey, map, selectedFeature]);

  return null;
}

function featureLabel(feature) {
  const properties = feature.properties || {};
  return (
    properties.Name ||
    properties.name ||
    properties.title ||
    `Feature ${feature.index}`
  );
}

function makeStyle(feature, selectedIndex) {
  const selected = feature.properties?.__featureIndex === selectedIndex;
  return {
    color: selected ? "#d56935" : "#087f78",
    weight: selected ? 4 : 2.5,
    opacity: 0.95,
    fillColor: selected ? "#f4a56b" : "#36a79b",
    fillOpacity: selected ? 0.68 : 0.34,
  };
}

function pointToLayer(feature, latlng, selectedIndex) {
  const selected = feature.properties?.__featureIndex === selectedIndex;
  return L.circleMarker(latlng, {
    radius: selected ? 9 : 7,
    color: selected ? "#b95325" : "#ffffff",
    weight: 2,
    fillColor: selected ? "#e5824e" : "#087f78",
    fillOpacity: 0.96,
  });
}

export default function MapView({
  features,
  selectedIndex,
  onSelect,
  datasetKey,
}) {
  const { collection, projectionErrors } = useMemo(() => {
    const transformed = [];
    const errors = [];
    for (const feature of features) {
      const projected = featureToWgs84(feature);
      if (!projected) {
        if (feature.geometry) errors.push(feature.index);
        continue;
      }
      projected.properties = {
        ...(projected.properties || {}),
        __featureIndex: feature.index,
      };
      transformed.push(projected);
    }
    return {
      collection: { type: "FeatureCollection", features: transformed },
      projectionErrors: errors,
    };
  }, [features]);

  const selectedFeature = features.find((feature) => feature.index === selectedIndex);

  return (
    <div className="map-frame">
      <MapContainer
        center={[20, 0]}
        zoom={2}
        scrollWheelZoom
        className="leaflet-map"
        preferCanvas
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {collection.features.map((feature) => {
          const featureIndex = feature.properties.__featureIndex;
          const selected = featureIndex === selectedIndex;
          const label = featureLabel({
            ...feature,
            index: featureIndex,
          });
          const measurement = features.find(
            (item) => item.index === featureIndex,
          );
          return (
            <GeoJSON
              key={`${datasetKey}-${featureIndex}-${selected ? "selected" : "normal"}`}
              data={feature}
              style={() => makeStyle(feature, selectedIndex)}
              pointToLayer={(geoFeature, latlng) =>
                pointToLayer(geoFeature, latlng, selectedIndex)
              }
              eventHandlers={{
                click: () => onSelect(featureIndex),
              }}
              onEachFeature={(geoFeature, layer) => {
                const type = measurement?.geometry_type || "Unknown";
                const amount =
                  measurement?.measurement === null ||
                  measurement?.measurement === undefined
                    ? "Not measured"
                    : `${Number(measurement.measurement).toLocaleString(
                        undefined,
                        { maximumFractionDigits: 2 },
                      )} ${measurement.unit || ""}`;
                layer.bindPopup(
                  `<strong>${escapeHtml(label)}</strong><br/>${escapeHtml(
                    type,
                  )}<br/>${escapeHtml(amount)}`,
                );
              }}
            />
          );
        })}
        <MapViewport
          collection={collection}
          selectedFeature={selectedFeature}
          datasetKey={datasetKey}
        />
      </MapContainer>
      {projectionErrors.length > 0 && (
        <p className="map-note">
          {projectionErrors.length} feature
          {projectionErrors.length === 1 ? "" : "s"} could not be placed because
          their geometry or source CRS is missing or unsupported.
        </p>
      )}
      {collection.features.length === 0 && (
        <p className="map-overlay">No renderable feature geometry is available.</p>
      )}
    </div>
  );
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}
