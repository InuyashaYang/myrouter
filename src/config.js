export function getListenConfig() {
  return {
    listenHost: process.env.LISTEN_HOST || "127.0.0.1",
    listenPort: parseInt(process.env.LISTEN_PORT || "8787", 10)
  };
}

export function getEnvOverrides() {
  const upstreamBaseUrl = (process.env.UPSTREAM_BASE_URL || "").replace(/\/$/, "");
  const upstreamApiKey = process.env.UPSTREAM_API_KEY || "";

  const localApiKeys = parseCsv(process.env.LOCAL_API_KEYS || "");
  const adminApiKeys = parseCsv(process.env.ADMIN_API_KEYS || "");
  const allowedModels = parseCsv(process.env.ALLOWED_MODELS || "");

  const requestTimeoutMsRaw = process.env.REQUEST_TIMEOUT_MS || "";
  const requestTimeoutMs = requestTimeoutMsRaw ? parseInt(requestTimeoutMsRaw, 10) : null;

  const disableStreamingRaw = process.env.DISABLE_STREAMING || "";
  const disableStreaming = disableStreamingRaw ? parseBool(disableStreamingRaw) : null;

  return {
    upstreamBaseUrl: upstreamBaseUrl || null,
    upstreamApiKey: upstreamApiKey || null,
    localApiKeys: localApiKeys.length ? localApiKeys : null,
    adminApiKeys: adminApiKeys.length ? adminApiKeys : null,
    allowedModels: allowedModels.length ? allowedModels : null,
    requestTimeoutMs: Number.isFinite(requestTimeoutMs) ? requestTimeoutMs : null,
    disableStreaming
  };
}

function parseBool(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return false;
}

function parseCsv(value) {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
