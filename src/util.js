import crypto from "node:crypto";

export function getAuthToken(headers) {
  const xApiKey = headers["x-api-key"];
  if (typeof xApiKey === "string" && xApiKey.trim()) return xApiKey.trim();

  const auth = headers["authorization"];
  if (typeof auth === "string") {
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m && m[1]) return m[1].trim();
  }
  return "";
}

export function enforceLocalAuthOrThrow(config, headers) {
  if (!config.localApiKeys || config.localApiKeys.length === 0) return;
  const token = getAuthToken(headers);
  if (!token || !config.localApiKeys.includes(token)) {
    const err = new Error("Unauthorized");
    err.statusCode = 401;
    throw err;
  }
}

export function isLoopbackAddress(addr) {
  if (!addr || typeof addr !== "string") return false;
  if (addr === "::1") return true;
  if (addr.startsWith("127.")) return true;
  if (addr.startsWith("::ffff:127.")) return true;
  return false;
}

export function resolveKeyPolicyOrThrow({ config, headers }) {
  const token = getAuthToken(headers);
  if (!token) {
    const err = new Error("Unauthorized");
    err.statusCode = 401;
    throw err;
  }

  const keys = Array.isArray(config && config.keys) ? config.keys : [];
  if (keys.length) {
    const hit = keys.find((k) => k && typeof k === "object" && k.key === token);
    if (!hit) {
      const err = new Error("Unauthorized");
      err.statusCode = 401;
      throw err;
    }
    return {
      key: token,
      name: hit.name || "",
      wrapper: hit.wrapper || "",
      allowedEndpoints: Array.isArray(hit.allowedEndpoints) ? hit.allowedEndpoints : [],
      allowedModels: Array.isArray(hit.allowedModels) ? hit.allowedModels : [],
      disableStreaming: hit.disableStreaming === true
    };
  }

  // Legacy fallback: localApiKeys -> anthropic wrapper
  enforceLocalAuthOrThrow(config, headers);
  return {
    key: token,
    name: "legacy",
    wrapper: "anthropic",
    allowedEndpoints: ["/v1/messages", "/v1/models"],
    allowedModels: Array.isArray(config.allowedModels) ? config.allowedModels : [],
    disableStreaming: !!config.disableStreaming
  };
}

export function randomId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

export function safeJsonParse(str) {
  try {
    return { ok: true, value: JSON.parse(str) };
  } catch (e) {
    return { ok: false, error: e };
  }
}

export function toText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((b) => {
      if (!b || typeof b !== "object") return "";
      if (b.type === "text" && typeof b.text === "string") return b.text;
      return "";
    })
    .join("");
}

export function redactHeaders(headers) {
  const out = { ...headers };
  if (out.authorization) out.authorization = "[REDACTED]";
  if (out["x-api-key"]) out["x-api-key"] = "[REDACTED]";
  return out;
}
