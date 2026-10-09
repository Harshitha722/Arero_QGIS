import { useEffect, useState } from "react";

function getFeatureName(feature) {
  const properties = feature.properties || {};
  return (
    properties.Name ||
    properties.name ||
    properties.title ||
    `Feature ${feature.index}`
  );
}

function formatMeasurement(feature) {
  if (feature.measurement === null || feature.measurement === undefined) {
    return "N/A";
  }
  const measurement = Number(feature.measurement);
  return Number.isFinite(measurement)
    ? measurement.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : "N/A";
}

export default function FeatureTable({ features, selectedIndex, onSelect }) {
  const pageSize = 10;
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(features.length / pageSize));

  useEffect(() => {
    setPage(0);
  }, [features]);

  useEffect(() => {
    const selectedPosition = features.findIndex((feature) => feature.index === selectedIndex);
    if (selectedPosition >= 0) setPage(Math.floor(selectedPosition / pageSize));
  }, [features, selectedIndex]);

  if (features.length === 0) {
    return <p className="empty-inline">No measurable features found.</p>;
  }

  return (
    <div className="table-scroll">
      <table className="feature-table">
        <thead>
          <tr>
            <th scope="col">Index</th>
            <th scope="col">Feature</th>
            <th scope="col">Geometry</th>
            <th scope="col">Measurement</th>
          </tr>
        </thead>
        <tbody>
          {features.slice(page * pageSize, (page + 1) * pageSize).map((feature) => {
            const selected = feature.index === selectedIndex;
            return (
              <tr
                key={feature.index}
                className={selected ? "selected-row" : ""}
                aria-selected={selected}
              >
                <td>
                  <button
                    className="feature-row-button index-button"
                    type="button"
                    onClick={() => onSelect(feature.index)}
                    aria-label={`Select feature ${getFeatureName(feature)}`}
                  >
                    {feature.index}
                  </button>
                </td>
                <td>
                  <button
                    className="feature-row-button feature-name-button"
                    type="button"
                    onClick={() => onSelect(feature.index)}
                  >
                    {getFeatureName(feature)}
                  </button>
                </td>
                <td>
                  <span className="table-geometry">
                    {feature.geometry_type || "Unknown"}
                  </span>
                </td>
                <td>
                  <strong>{formatMeasurement(feature)}</strong>
                  {feature.unit && <span className="table-unit"> {feature.unit}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {pageCount > 1 && (
        <nav className="table-pagination" aria-label="Feature pages">
          <span>{page * pageSize + 1}–{Math.min((page + 1) * pageSize, features.length)} of {features.length}</span>
          <div>
            <button type="button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0} aria-label="Previous page">‹</button>
            <strong>{page + 1} / {pageCount}</strong>
            <button type="button" onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))} disabled={page === pageCount - 1} aria-label="Next page">›</button>
          </div>
        </nav>
      )}
    </div>
  );
}

