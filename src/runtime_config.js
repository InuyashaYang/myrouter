import fs from "node:fs/promises";
import path from "node:path";
import { defaultAllowedModels } from "./models.js";

export function getRuntimeConfigPath() {
  const p = process.env.RUNTIME_CONFIG_PATH;
  return p && p.trim() ? p.trim() : path.join(process.cwd(), "config.runtime.json");
}

export async function createRuntimeConfigManager({ runtimeConfigPath, envOverrides }) {
  let fileConfig = await readConfigFile(runtimeConfigPath);
  let effective = mergeEffective(fileConfig, envOverrides);

  return {
    getEffective() {
      return effective;
    },
    getFileConfig() {
      return fileConfig;
    },
    getMeta() {
      return {
        runtimeConfigPath,
        envLocks: getEnvLocks(envOverrides)
      };
    },
    async update(partialUpdate) {
      fileConfig = applyUpdate(fileConfig, partialUpdate);
      await writeConfigFile(runtimeConfigPath, fileConfig);
      effective = mergeEffective(fileConfig, envOverrides);
      return effective;
    },
    async updateRaw(newConfig) {
      fileConfig = normalizeRawConfig(newConfig);
      await writeConfigFile(runtimeConfigPath, fileConfig);
      effective = mergeEffective(fileConfig, envOverrides);
      return effective;
    }
  };
}

function mergeEffective(fileConfig, envOverrides) {
  const defaults = {
    upstreamBaseUrl: "",
    upstreamApiKey: "",
    localApiKeys: [],
    allowedModels: defaultAllowedModels(),
    requestTimeoutMs: 60000,
    disableStreaming: false
  };

  const merged = {
    upstreamBaseUrl: pickFirst(envOverrides.upstreamBaseUrl, fileConfig.upstreamBaseUrl, defaults.upstreamBaseUrl),
    upstreamApiKey: pickFirst(envOverrides.upstreamApiKey, fileConfig.upstreamApiKey, defaults.upstreamApiKey),
    localApiKeys: pickFirst(envOverrides.localApiKeys, fileConfig.localApiKeys, defaults.localApiKeys),
    allowedModels: pickFirst(envOverrides.allowedModels, fileConfig.allowedModels, defaults.allowedModels),
    requestTimeoutMs: pickFirst(envOverrides.requestTimeoutMs, fileConfig.requestTimeoutMs, defaults.requestTimeoutMs),
    disableStreaming: pickFirst(envOverrides.disableStreaming, fileConfig.disableStreaming, defaults.disableStreaming)
  };

  merged.keys = Array.isArray(fileConfig.keys) ? fileConfig.keys : null;

  // Ignore profile-based config in legacy mode.

  merged.upstreamBaseUrl = (typeof merged.upstreamBaseUrl === "string" ? merged.upstreamBaseUrl : "").replace(/\/$/, "");
  merged.upstreamApiKey = typeof merged.upstreamApiKey === "string" ? merged.upstreamApiKey : "";
  merged.localApiKeys = normalizeStringArray(merged.localApiKeys);
  merged.allowedModels = normalizeStringArray(merged.allowedModels);
  if (merged.allowedModels.length === 0) merged.allowedModels = defaultAllowedModels();
  merged.requestTimeoutMs = normalizeTimeout(merged.requestTimeoutMs);
  merged.disableStreaming = !!merged.disableStreaming;
  merged.configured = !!(merged.upstreamBaseUrl && merged.upstreamApiKey);

  return merged;
}

function applyUpdate(prev, patch) {
  const next = { ...prev };
  if (Object.prototype.hasOwnProperty.call(patch, "upstreamBaseUrl")) {
    next.upstreamBaseUrl = typeof patch.upstreamBaseUrl === "string" ? patch.upstreamBaseUrl : "";
  }
  if (Object.prototype.hasOwnProperty.call(patch, "upstreamApiKey")) {
    next.upstreamApiKey = typeof patch.upstreamApiKey === "string" ? patch.upstreamApiKey : "";
  }
  if (Object.prototype.hasOwnProperty.call(patch, "localApiKeys")) {
    next.localApiKeys = normalizeStringArray(patch.localApiKeys);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "allowedModels")) {
    next.allowedModels = normalizeStringArray(patch.allowedModels);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "requestTimeoutMs")) {
    next.requestTimeoutMs = normalizeTimeout(patch.requestTimeoutMs);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "disableStreaming")) {
    next.disableStreaming = !!patch.disableStreaming;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "keys")) {
    next.keys = Array.isArray(patch.keys) ? patch.keys : [];
  }

  return next;
}

function normalizeRawConfig(value) {
  const v = value && typeof value === "object" ? value : {};
  const out = { ...v };

  // Strip profile-based config in legacy mode
  delete out.apiKeys;
  delete out.profiles;
  delete out.defaultProfile;

  if (!Array.isArray(out.keys)) out.keys = [];
  out.keys = out.keys
    .filter((k) => k && typeof k === "object")
    .map((k) => ({
      key: typeof k.key === "string" ? k.key : "",
      name: typeof k.name === "string" ? k.name : "",
      wrapper: typeof k.wrapper === "string" ? k.wrapper : "anthropic",
      allowedEndpoints: Array.isArray(k.allowedEndpoints) ? k.allowedEndpoints : [],
      allowedModels: normalizeStringArray(k.allowedModels),
      disableStreaming: !!k.disableStreaming
    }))
    .filter((k) => k.key);

  // Legacy fields
  if (typeof out.upstreamBaseUrl !== "string") out.upstreamBaseUrl = "";
  if (typeof out.upstreamApiKey !== "string") out.upstreamApiKey = "";
  out.localApiKeys = normalizeStringArray(out.localApiKeys);
  out.allowedModels = normalizeStringArray(out.allowedModels);
  out.requestTimeoutMs = normalizeTimeout(out.requestTimeoutMs);
  out.disableStreaming = !!out.disableStreaming;

  return out;
}

async function readConfigFile(runtimeConfigPath) {
  try {
    const raw = await fs.readFile(runtimeConfigPath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    if (e && (e.code === "ENOENT" || e.code === "ENOTDIR")) return {};
    throw e;
  }
}

async function writeConfigFile(runtimeConfigPath, config) {
  const dir = path.dirname(runtimeConfigPath);
  await fs.mkdir(dir, { recursive: true });

  const tmpPath = `${runtimeConfigPath}.${Date.now()}.tmp`;
  const json = JSON.stringify(config, null, 2) + "\n";
  await fs.writeFile(tmpPath, json, "utf8");

  // Windows-safe replace.
  await fs.copyFile(tmpPath, runtimeConfigPath);
  await fs.rm(tmpPath, { force: true });
}

function pickFirst(a, b, c) {
  if (a !== null && a !== undefined) return a;
  if (b !== null && b !== undefined) return b;
  return c;
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) return value.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/[,\n\r]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeTimeout(value) {
  const n = typeof value === "number" ? value : parseInt(String(value || ""), 10);
  if (!Number.isFinite(n)) return 60000;
  return Math.max(1000, Math.min(10 * 60 * 1000, n));
}

function getEnvLocks(envOverrides) {
  return {
    upstreamBaseUrl: envOverrides.upstreamBaseUrl !== null,
    upstreamApiKey: envOverrides.upstreamApiKey !== null,
    localApiKeys: envOverrides.localApiKeys !== null,
    allowedModels: envOverrides.allowedModels !== null,
    requestTimeoutMs: envOverrides.requestTimeoutMs !== null,
    disableStreaming: envOverrides.disableStreaming !== null
  };
}
