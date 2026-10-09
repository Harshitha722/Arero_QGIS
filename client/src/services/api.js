const REQUEST_TIMEOUT_MS = 60_000;

export class ApiError extends Error {
  constructor(message) {
    super(message);
    this.name = "ApiError";
  }
}

function getApiBaseUrl() {
  return (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
}

async function requestJson(path, options = {}) {
  let response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...options,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error.name === "TimeoutError") {
      throw new ApiError("The backend took too long to respond. Please try again.");
    }
    throw new ApiError(
      "Could not connect to the backend. Check that the API is running and try again.",
    );
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new ApiError("The backend returned an invalid response.");
  }

  if (!response.ok) {
    const detail =
      typeof body?.detail === "string"
        ? body.detail
        : `The backend returned HTTP ${response.status}.`;
    throw new ApiError(detail);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError("The backend returned an invalid response.");
  }
  return body;
}

function validateMetadata(metadata, expectedId) {
  if (
    !metadata ||
    metadata.id !== expectedId ||
    typeof metadata.filename !== "string" ||
    typeof metadata.feature_count !== "number" ||
    typeof metadata.status !== "string"
  ) {
    throw new ApiError("The backend returned invalid file information.");
  }
  return metadata;
}

function validateMeasurements(payload, expectedId) {
  if (payload?.file_id !== expectedId || !Array.isArray(payload.features)) {
    throw new ApiError("The backend returned invalid feature measurements.");
  }

  return payload.features.map((feature) => {
    if (
      !feature ||
      !Number.isInteger(feature.index) ||
      !feature.properties ||
      typeof feature.properties !== "object" ||
      (feature.geometry !== null &&
        (typeof feature.geometry !== "object" ||
          typeof feature.geometry.type !== "string"))
    ) {
      throw new ApiError("The backend returned an invalid feature.");
    }
    return feature;
  });
}

export async function uploadAndLoadFile(file) {
  const data = new FormData();
  data.append("file", file);
  const uploaded = await requestJson("/api/files/", {
    method: "POST",
    body: data,
  });

  if (typeof uploaded.id !== "string" || uploaded.id.length === 0) {
    throw new ApiError("The upload response did not include a file ID.");
  }

  const encodedId = encodeURIComponent(uploaded.id);
  const [rawMetadata, rawMeasurements] = await Promise.all([
    requestJson(`/api/files/${encodedId}/`),
    requestJson(`/api/files/${encodedId}/measurements/`),
  ]);

  return {
    metadata: validateMetadata(rawMetadata, uploaded.id),
    features: validateMeasurements(rawMeasurements, uploaded.id),
  };
}
