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

  // Profile-based config (preferred)
  merged.apiKeys = Array.isArray(fileConfig.apiKeys) ? fileConfig.apiKeys : null;
  merged.profiles = fileConfig.profiles && typeof fileConfig.profiles === "object" ? fileConfig.profiles : null;
  merged.defaultProfile = typeof fileConfig.defaultProfile === "string" ? fileConfig.defaultProfile : null;

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

  if (Object.prototype.hasOwnProperty.call(patch, "defaultProfile")) {
    next.defaultProfile = typeof patch.defaultProfile === "string" ? patch.defaultProfile : "";
  }
  if (Object.prototype.hasOwnProperty.call(patch, "apiKeys")) {
    next.apiKeys = Array.isArray(patch.apiKeys) ? patch.apiKeys : [];
  }
  if (Object.prototype.hasOwnProperty.call(patch, "profiles")) {
    next.profiles = patch.profiles && typeof patch.profiles === "object" ? patch.profiles : {};
  }

  // Profile-targeted update: { profileName, profilePatch: {...} }
  if (patch && typeof patch === "object" && patch.profileName && patch.profilePatch && typeof patch.profilePatch === "object") {
    const pn = String(patch.profileName);
    const profiles = next.profiles && typeof next.profiles === "object" ? { ...next.profiles } : {};
    const prevProfile = profiles[pn] && typeof profiles[pn] === "object" ? { ...profiles[pn] } : {};
    const pp = patch.profilePatch;

    if (Object.prototype.hasOwnProperty.call(pp, "wrapper")) {
      prevProfile.wrapper = typeof pp.wrapper === "string" ? pp.wrapper : "";
    }
    if (Object.prototype.hasOwnProperty.call(pp, "upstreamBaseUrl")) {
      prevProfile.upstreamBaseUrl = typeof pp.upstreamBaseUrl === "string" ? pp.upstreamBaseUrl : "";
    }
    if (Object.prototype.hasOwnProperty.call(pp, "upstreamApiKey")) {
      // Allow keep sentinel
      if (pp.upstreamApiKey === "__KEEP__") {
        // no-op
      } else {
        prevProfile.upstreamApiKey = typeof pp.upstreamApiKey === "string" ? pp.upstreamApiKey : "";
      }
    }
    if (Object.prototype.hasOwnProperty.call(pp, "allowedModels")) {
      prevProfile.allowedModels = normalizeStringArray(pp.allowedModels);
    }
    if (Object.prototype.hasOwnProperty.call(pp, "requestTimeoutMs")) {
      prevProfile.requestTimeoutMs = normalizeTimeout(pp.requestTimeoutMs);
    }
    if (Object.prototype.hasOwnProperty.call(pp, "disableStreaming")) {
      prevProfile.disableStreaming = !!pp.disableStreaming;
    }

    profiles[pn] = prevProfile;
    next.profiles = profiles;
  }

  return next;
}

function normalizeRawConfig(value) {
  const v = value && typeof value === "object" ? value : {};
  const out = { ...v };

  if (!Array.isArray(out.apiKeys)) out.apiKeys = [];
  out.apiKeys = out.apiKeys
    .filter((k) => k && typeof k === "object")
    .map((k) => ({
      key: typeof k.key === "string" ? k.key : "",
      profile: typeof k.profile === "string" ? k.profile : ""
    }))
    .filter((k) => k.key && k.profile);

  if (!out.profiles || typeof out.profiles !== "object") out.profiles = {};
  const nextProfiles = {};
  for (const [name, p] of Object.entries(out.profiles)) {
    if (!p || typeof p !== "object") continue;
    nextProfiles[name] = {
      wrapper: typeof p.wrapper === "string" ? p.wrapper : "anthropic_messages",
      upstreamBaseUrl: typeof p.upstreamBaseUrl === "string" ? p.upstreamBaseUrl : "",
      upstreamApiKey: typeof p.upstreamApiKey === "string" ? p.upstreamApiKey : "",
      allowedModels: normalizeStringArray(p.allowedModels),
      requestTimeoutMs: normalizeTimeout(p.requestTimeoutMs),
      disableStreaming: !!p.disableStreaming
    };
  }
  out.profiles = nextProfiles;

  if (typeof out.defaultProfile !== "string") out.defaultProfile = "";

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
