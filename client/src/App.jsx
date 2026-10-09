import { useState } from "react";

import AreaChart from "./components/AreaChart.jsx";
import FeatureTable from "./components/FeatureTable.jsx";
import FileUpload from "./components/FileUpload.jsx";
import MapView from "./components/MapView.jsx";
import { uploadAndLoadFile } from "./services/api.js";

function App() {
  const [dataset, setDataset] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [resultsView, setResultsView] = useState("table");

  async function processUploadedFile(file) {
    const result = await uploadAndLoadFile(file);
    setDataset(result);
    setSelectedIndex(null);
  }

  function clearCurrentDataset() {
    setDataset(null);
    setSelectedIndex(null);
  }

  const metadata = dataset?.metadata;
  const features = dataset?.features || [];
  const measurableCount = features.filter(
    (feature) => feature.measurement !== null && feature.measurement !== undefined,
  ).length;

  return (
    <div className={`app-shell ${metadata ? "has-dataset" : ""}`}>
      <main className="main-content">
        <section className="hero">
          <div>
            <p className="eyebrow">SPATIAL DATA TOOLKIT</p>
            <h1>Geospatial File Measurement API</h1>
            <p className="hero-copy">
              Inspect features and measure land areas and route lengths from your
              KML and Shapefile datasets.
            </p>
          </div>
          <div className="hero-ornament" aria-hidden="true">
            <span className="hero-orbit orbit-one" />
            <span className="hero-orbit orbit-two" />
            <span className="hero-orbit orbit-three" />
            <span className="hero-center" />
          </div>
        </section>

        <FileUpload
          onProcessing={clearCurrentDataset}
          onProcessed={processUploadedFile}
        />

        {metadata ? (
          <>
            <section className="dataset-summary" aria-label="Dataset summary">
              <div className="dataset-file">
                <span className="file-icon" aria-hidden="true">▤</span>
                <span>
                  <strong>{metadata.filename}</strong>
                  <small>Processed dataset</small>
                </span>
              </div>
              <div className="summary-stat">
                <span>FEATURES</span>
                <strong>{metadata.feature_count}</strong>
              </div>
              <div className="summary-stat">
                <span>MEASURABLE</span>
                <strong>{measurableCount}</strong>
              </div>
              <div className="summary-stat">
                <span>SOURCE CRS</span>
                <strong>{metadata.crs || "Unknown"}</strong>
              </div>
              <div className="summary-status">
                <span className="success-dot" />
                {metadata.status || "COMPLETED"}
              </div>
            </section>

            {features.length === 0 ? (
              <section className="empty-dataset panel">
                <span className="empty-symbol" aria-hidden="true">⌖</span>
                <h2>No measurable features found</h2>
                <p>The file was processed, but the API returned no features.</p>
              </section>
            ) : (
              <div className="workspace-grid">
                <section className="panel map-panel">
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">GEOGRAPHIC VIEW</p>
                      <h2>Feature map</h2>
                    </div>
                    <span className="map-hint">
                      <span className="map-hint-dot" /> Select a feature to inspect
                    </span>
                  </div>
                  <MapView
                    features={features}
                    selectedIndex={selectedIndex}
                    onSelect={setSelectedIndex}
                    datasetKey={metadata.id}
                  />
                  <div className="map-legend">
                    <span><i className="legend-polygon" /> Polygon</span>
                    <span><i className="legend-line" /> Line</span>
                    <span><i className="legend-point" /> Point</span>
                    <span><i className="legend-selected" /> Selected</span>
                  </div>
                </section>

                <aside className={`results-column results-${resultsView}`}>
                  <div className="view-mode-switch" role="tablist" aria-label="Results view">
                    <button type="button" role="tab" aria-selected={resultsView === "table"} className={resultsView === "table" ? "active" : ""} onClick={() => setResultsView("table")}>Table</button>
                    <button type="button" role="tab" aria-selected={resultsView === "comparison"} className={resultsView === "comparison" ? "active" : ""} onClick={() => setResultsView("comparison")}>Comparison</button>
                  </div>
                  {resultsView !== "comparison" && <section className="panel table-panel">
                    <div className="panel-heading">
                      <div>
                        <p className="eyebrow">DATA EXPLORER</p>
                        <h2>Feature measurements</h2>
                      </div>
                      <span className="count-badge">{features.length}</span>
                    </div>
                    <FeatureTable
                      features={features}
                      selectedIndex={selectedIndex}
                      onSelect={setSelectedIndex}
                    />
                  </section>}

                  {resultsView !== "table" && <section className="panel chart-panel">
                    <div className="panel-heading">
                      <div>
                        <p className="eyebrow">STATISTICAL COMPARISON</p>
                        <h2>Area difference analysis</h2>
                      </div>
                      <span className="chart-unit">Δ m²</span>
                    </div>
                    <AreaChart features={features} />
                  </section>}
                </aside>
              </div>
            )}
          </>
        ) : (
          <section className="welcome-panel">
            <div className="welcome-map" aria-hidden="true">
              <div className="contour contour-a" />
              <div className="contour contour-b" />
              <div className="contour contour-c" />
              <span className="welcome-pin pin-a" />
              <span className="welcome-pin pin-b" />
              <span className="welcome-pin pin-c" />
            </div>
            <div>
              <p className="eyebrow">READY WHEN YOU ARE</p>
              <h2>No file uploaded</h2>
              <p>
                Add a KML or zipped Shapefile to view its geometry and
                measurements on the map.
              </p>
            </div>
            <div className="welcome-steps">
              <span><i>01</i> Upload data</span>
              <span><i>02</i> Inspect features</span>
              <span><i>03</i> Review measurements</span>
            </div>
          </section>
        )}

        <footer className="page-footer">
          <span>TerraMeasure · Geospatial File Measurement API</span>
          <span>Measurements are calculated in projected coordinates.</span>
        </footer>
      </main>
    </div>
  );
}

export default App;
