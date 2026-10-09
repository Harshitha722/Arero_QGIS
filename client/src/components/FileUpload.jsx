import { useRef, useState } from "react";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileUpload({ onProcessing, onProcessed }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [state, setState] = useState("idle");
  const [message, setMessage] = useState("");
  const [uploadToken, setUploadToken] = useState("");

  function chooseFile(event) {
    const selected = event.target.files?.[0] || null;
    setFile(selected);
    setMessage("");
    setState("idle");
    setUploadToken("");
  }

  async function processFile() {
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!["kml", "zip"].includes(extension)) {
      setState("error");
      setMessage("Choose a .kml file or a .zip containing a Shapefile.");
      return;
    }
    if (file.size === 0) {
      setState("error");
      setMessage("This file is empty. Choose another file.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setState("error");
      setMessage("The maximum upload size is 50 MB.");
      return;
    }

    const token = `${file.name}:${file.size}:${file.lastModified}`;
    setState("processing");
    setMessage("");
    onProcessing();
    try {
      await onProcessed(file);
      setState("success");
      setMessage("File processed successfully.");
      setUploadToken(token);
    } catch (error) {
      setState("error");
      setMessage(error.message || "Unable to process this file.");
    }
  }

  const isAlreadyProcessed =
    state === "success" &&
    uploadToken ===
      (file ? `${file.name}:${file.size}:${file.lastModified}` : "");
  const extensionLabel = file
    ? file.name.split(".").pop()?.toUpperCase()
    : "KML or ZIP";

  return (
    <section className="upload-card" aria-labelledby="upload-heading">
      <div className="upload-heading">
        <div>
          <p className="eyebrow">DATA INTAKE</p>
          <h2 id="upload-heading">Upload a dataset</h2>
        </div>
        <span className="format-chip">KML · SHAPEFILE ZIP</span>
      </div>
      <div className="upload-controls">
        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept=".kml,.zip"
          onChange={chooseFile}
          aria-label="Choose KML or Shapefile ZIP"
        />
        <button
          className="button button-secondary choose-button"
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={state === "processing"}
        >
          <span aria-hidden="true">＋</span>
          Choose file
        </button>
        <div className={`file-summary ${file ? "has-file" : ""}`}>
          <strong>{file ? file.name : "No file selected"}</strong>
          <span>
            {file
              ? `${extensionLabel} · ${formatBytes(file.size)}`
              : "Choose a KML or zipped Shapefile to begin"}
          </span>
        </div>
        <button
          className="button button-primary process-button"
          type="button"
          onClick={processFile}
          disabled={!file || state === "processing" || isAlreadyProcessed}
        >
          {state === "processing" ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Processing…
            </>
          ) : isAlreadyProcessed ? (
            "Processed"
          ) : (
            "Process file"
          )}
        </button>
      </div>
      <div className="upload-status" aria-live="polite">
        {state === "processing" && (
          <p className="status-message status-processing">Processing file…</p>
        )}
        {state === "success" && (
          <p className="status-message status-success">✓ {message}</p>
        )}
        {state === "error" && (
          <p className="status-message status-error">! {message}</p>
        )}
      </div>
    </section>
  );
}
