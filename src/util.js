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

export function getAdminToken(headers) {
  const xAdminKey = headers["x-admin-key"];
  if (typeof xAdminKey === "string" && xAdminKey.trim()) return xAdminKey.trim();
  return getAuthToken(headers);
}

export function isLoopbackAddress(addr) {
  if (!addr || typeof addr !== "string") return false;
  if (addr === "::1") return true;
  if (addr.startsWith("127.")) return true;
  if (addr.startsWith("::ffff:127.")) return true;
  return false;
}

export function enforceAdminAuthOrThrow({ adminApiKeys, listenHost, remoteAddress, headers }) {
  const keys = Array.isArray(adminApiKeys) ? adminApiKeys : [];
  if (keys.length === 0) {
    // Bootstrap mode: only allow loopback when no admin key configured.
    const ok = isLoopbackAddress(remoteAddress) && (listenHost === "127.0.0.1" || listenHost === "::1" || listenHost === "localhost");
    if (ok) return;
    const err = new Error("Admin key not configured");
    err.statusCode = 401;
    throw err;
  }

  const token = getAdminToken(headers);
  if (!token || !keys.includes(token)) {
    const err = new Error("Unauthorized");
    err.statusCode = 401;
    throw err;
  }
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
