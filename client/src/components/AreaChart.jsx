import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const POLYGON_TYPES = new Set(["Polygon", "MultiPolygon"]);
const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
const precise = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

function displayName(feature) {
  const properties = feature.properties || {};
  return properties.Name || properties.name || properties.title || `Feature ${feature.index}`;
}

export default function AreaChart({ features }) {
  const polygons = features
    .filter(
      (feature) =>
        POLYGON_TYPES.has(feature.geometry_type) &&
        feature.unit === "mÂ²" &&
        feature.measurement !== null &&
        feature.measurement !== undefined &&
        Number.isFinite(Number(feature.measurement)),
    )
    .map((feature) => ({
      name: displayName(feature),
      area: Number(feature.measurement),
      index: feature.index,
    }));

  if (polygons.length === 0) {
    return (
      <div className="chart-empty">
        <span aria-hidden="true">∅</span>
        <p>No polygon features are available for comparison.</p>
      </div>
    );
  }

  const orderedAreas = polygons.map(({ area }) => area).sort((a, b) => a - b);
  const middle = Math.floor(orderedAreas.length / 2);
  const median = orderedAreas.length % 2
    ? orderedAreas[middle]
    : (orderedAreas[middle - 1] + orderedAreas[middle]) / 2;
  const above = polygons.filter(({ area }) => area > median).length;
  const below = polygons.filter(({ area }) => area < median).length;
  const comparisonData = polygons
    .map((feature) => ({
      ...feature,
      difference: feature.area - median,
      differencePercent: median === 0 ? 0 : ((feature.area - median) / median) * 100,
    }))
    .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))
    .slice(0, 10);

  return (
    <div className="comparison-content">
      <div className="comparison-metrics" aria-label="Comparison summary">
        <div className="comparison-metric baseline-metric">
          <span>MEDIAN BASELINE</span>
          <strong>{precise.format(median)} m²</strong>
          <small>{polygons.length.toLocaleString()} polygon features</small>
        </div>
        <div className="comparison-metric">
          <span>ABOVE MEDIAN</span>
          <strong>{above.toLocaleString()}</strong>
          <small>greater area</small>
        </div>
        <div className="comparison-metric">
          <span>BELOW MEDIAN</span>
          <strong>{below.toLocaleString()}</strong>
          <small>smaller area</small>
        </div>
      </div>
      <div className="comparison-chart-heading">
        <div>
          <strong>Deviation from median area</strong>
          <span>Top 10 features by absolute difference</span>
        </div>
        <span className="comparison-key"><i className="positive-key" /> Above <i className="negative-key" /> Below</span>
      </div>
      <div className="chart-container">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={comparisonData}
            layout="vertical"
            margin={{ top: 3, right: 22, bottom: 3, left: 2 }}
          >
            <CartesianGrid stroke="#e8edf2" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fill: "#778596", fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: "#d8e0e8" }}
              tickFormatter={(value) => compact.format(value)}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={126}
              tick={{ fill: "#445366", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => value.length > 19 ? `${value.slice(0, 18)}…` : value}
            />
            <ReferenceLine x={0} stroke="#8290a0" strokeWidth={1.3} />
            <Tooltip
              cursor={{ fill: "#f3f6f9" }}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.name || "Feature"}
              formatter={(value, _, item) => {
                const row = item.payload;
                const sign = row.difference > 0 ? "+" : "";
                return [
                  `${sign}${precise.format(row.difference)} m² (${sign}${precise.format(row.differencePercent)}%)`,
                  "Difference from median",
                ];
              }}
              contentStyle={{ borderRadius: 8, borderColor: "#d9e1e9", fontSize: 12 }}
            />
            <Bar dataKey="difference" radius={[0, 4, 4, 0]} barSize={19}>
              {comparisonData.map((entry) => (
                <Cell key={entry.index} fill={entry.difference >= 0 ? "#148477" : "#d17a51"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
