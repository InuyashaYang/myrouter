import { randomId } from "./util.js";

const DEFAULT_MAX = 100;

function getMode() {
  const v = (process.env.REQUEST_LOG_MODE || "raw").toLowerCase();
  if (v === "off" || v === "none") return "off";
  if (v === "minimal" || v === "min") return "minimal";
  return "raw";
}

function getMax() {
  const v = parseInt(process.env.REQUEST_LOG_MAX || "", 10);
  if (Number.isFinite(v) && v > 0) return v;
  return DEFAULT_MAX;
}

function getRedactEnabled() {
  const v = (process.env.REQUEST_LOG_REDACT || "true").toLowerCase();
  return v !== "false" && v !== "0" && v !== "no";
}

const SENSITIVE_KEYS = new Set([
  "authorization",
  "x-api-key",
  "apiKey",
  "apikey",
  "token",
  "access_token",
  "refresh_token",
  "upstreamApiKey"
]);

function redactValue(value) {
  if (typeof value !== "string") return "[REDACTED]";
  const len = value.length;
  if (len <= 8) return "[REDACTED]";
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function sanitizeHeaders(headers, redact) {
  if (!headers || typeof headers !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    const key = k.toLowerCase();
    if (redact && (SENSITIVE_KEYS.has(key) || key.includes("authorization") || key.includes("api-key"))) {
      out[k] = redactValue(typeof v === "string" ? v : String(v));
    } else {
      out[k] = v;
    }
  }
  return out;
}

function sanitizeBody(body, redact, depth = 0) {
  if (!redact) return body;
  if (body === null || body === undefined) return body;
  if (depth > 6) return "[TRUNCATED]";

  if (Array.isArray(body)) {
    return body.map((v) => sanitizeBody(v, redact, depth + 1));
  }
  if (typeof body === "object") {
    const out = {};
    for (const [k, v] of Object.entries(body)) {
      if (SENSITIVE_KEYS.has(k)) {
        out[k] = redactValue(typeof v === "string" ? v : String(v));
      } else {
        out[k] = sanitizeBody(v, redact, depth + 1);
      }
    }
    return out;
  }
  return body;
}

class RequestLogStore {
  constructor() {
    this.max = getMax();
    this.mode = getMode();
    this.redact = getRedactEnabled();
    this.items = [];
  }

  isEnabled() {
    return this.mode !== "off";
  }

  createEntry({ method, path, headers, body }) {
    if (!this.isEnabled()) return null;
    const id = randomId("req");
    const entry = {
      id,
      time: new Date().toISOString(),
      method,
      path,
      status: null,
      durationMs: null,
      inbound: {
        headers: sanitizeHeaders(headers, this.redact),
        body: this.mode === "raw" ? sanitizeBody(body, this.redact) : undefined
      },
      mapped: null,
      upstream: null,
      error: null
    };

    this.items.push(entry);
    while (this.items.length > this.max) this.items.shift();
    return entry;
  }

  updateMapped(entry, mappedBody) {
    if (!entry) return;
    entry.mapped = this.mode === "raw" ? sanitizeBody(mappedBody, this.redact) : "[omitted]";
  }

  updateUpstreamRequest(entry, { url, headers, body }) {
    if (!entry) return;
    entry.upstream = entry.upstream || {};
    entry.upstream.request = {
      url,
      headers: sanitizeHeaders(headers, this.redact),
      body: this.mode === "raw" ? sanitizeBody(body, this.redact) : undefined
    };
  }

  updateUpstreamResponse(entry, { status, bodySnippet, usage, finishReason }) {
    if (!entry) return;
    entry.upstream = entry.upstream || {};
    entry.upstream.response = {
      status,
      bodySnippet,
      usage,
      finishReason
    };
  }

  finalize(entry, { status, durationMs, error }) {
    if (!entry) return;
    entry.status = status;
    entry.durationMs = durationMs;
    if (error) entry.error = error;
  }

  list(limit) {
    const n = typeof limit === "number" && limit > 0 ? limit : this.max;
    return this.items.slice(Math.max(0, this.items.length - n));
  }

  getById(id) {
    return this.items.find((e) => e.id === id) || null;
  }
}

export const requestLogStore = new RequestLogStore();
