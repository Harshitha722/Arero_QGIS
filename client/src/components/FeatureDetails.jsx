function featureName(feature) {
  const properties = feature.properties || {};
  return (
    properties.Name ||
    properties.name ||
    properties.title ||
    `Feature ${feature.index}`
  );
}

export default function FeatureDetails({ feature }) {
  if (!feature) {
    return (
      <section className="panel details-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">INSPECT</p>
            <h2>Feature details</h2>
          </div>
        </div>
        <div className="empty-selection">
          <span aria-hidden="true">◎</span>
          <p>Select a feature on the map or in the table to inspect its details.</p>
        </div>
      </section>
    );
  }

  const properties = Object.entries(feature.properties || {}).filter(
    ([, value]) => value !== null && value !== undefined && value !== "",
  );
  const measurement =
    feature.measurement === null || feature.measurement === undefined
      ? null
      : Number(feature.measurement);

  return (
    <section className="panel details-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">SELECTED FEATURE</p>
          <h2>{featureName(feature)}</h2>
        </div>
        <span className="geometry-pill">{feature.geometry_type || "Unknown"}</span>
      </div>
      <div className="measurement-highlight">
        <span>MEASUREMENT</span>
        <strong>
          {measurement === null || !Number.isFinite(measurement)
            ? "Not available"
            : `${measurement.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })} ${feature.unit || ""}`}
        </strong>
      </div>
      <dl className="detail-grid">
        {feature.source_crs && (
          <div>
            <dt>Source CRS</dt>
            <dd>{feature.source_crs}</dd>
          </div>
        )}
        {feature.projected_crs && (
          <div>
            <dt>Projected CRS</dt>
            <dd>{feature.projected_crs}</dd>
          </div>
        )}
        <div>
          <dt>Feature index</dt>
          <dd>{feature.index}</dd>
        </div>
      </dl>
      {properties.length > 0 && (
        <div className="properties-section">
          <h3>Properties</h3>
          <dl className="property-list">
            {properties.map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{String(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {feature.processing_error && (
        <p className="feature-warning">{feature.processing_error}</p>
      )}
    </section>
  );
}
