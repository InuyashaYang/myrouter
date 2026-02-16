import Fastify from "fastify";
import { getEnvOverrides, getListenConfig } from "./config.js";
import {
  enforceAdminAuthOrThrow,
  enforceLocalAuthOrThrow,
  isLoopbackAddress,
  redactHeaders
} from "./util.js";
import { buildModelsResponse } from "./models.js";
import { resolveModelOrThrow } from "./models.js";
import {
  anthropicToUpstreamChatBody,
  upstreamToAnthropicMessage
} from "./anthropic.js";
import { callUpstreamChatCompletions } from "./upstream.js";
import { pipeOpenAIStreamToAnthropic } from "./openai_stream_to_anthropic.js";
import {
  createRuntimeConfigManager,
  getRuntimeConfigPath
} from "./runtime_config.js";
import fs from "node:fs/promises";
import path from "node:path";

const listen = getListenConfig();
const envOverrides = getEnvOverrides();
const configManager = await createRuntimeConfigManager({
  runtimeConfigPath: getRuntimeConfigPath(),
  envOverrides
});

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || "info",
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.x-api-key",
        "request.headers.authorization",
        "request.headers.x-api-key"
      ],
      remove: true
    }
  },
  bodyLimit: 5 * 1024 * 1024
});

app.get("/healthz", async () => ({ ok: true }));

app.get("/docs", async (req, reply) => {
  if (!isLoopbackAddress(req.ip)) {
    reply.code(403).send({
      type: "error",
      error: { type: "forbidden", message: "Docs UI is only available on loopback." }
    });
    return;
  }
  const htmlPath = path.join(process.cwd(), "src", "ui", "docs.html");
  const html = await fs.readFile(htmlPath, "utf8");
  reply.header("content-type", "text/html; charset=utf-8");
  reply.send(html);
});

app.get("/admin", async (req, reply) => {
  // Serve UI only to loopback; actual config APIs are protected by admin auth.
  if (!isLoopbackAddress(req.ip)) {
    reply.code(403).send({
      type: "error",
      error: { type: "forbidden", message: "Admin UI is only available on loopback." }
    });
    return;
  }

  const htmlPath = path.join(process.cwd(), "src", "ui", "admin.html");
  const html = await fs.readFile(htmlPath, "utf8");
  reply.header("content-type", "text/html; charset=utf-8");
  reply.send(html);
});

app.get("/admin/config", async (req, reply) => {
  const cfg = configManager.getEffective();
  enforceAdminAuthOrThrow({
    adminApiKeys: cfg.adminApiKeys,
    listenHost: listen.listenHost,
    remoteAddress: req.ip,
    headers: req.headers
  });

  const meta = configManager.getMeta();
  reply.send({
    meta,
    configured: cfg.configured,
    upstreamBaseUrl: cfg.upstreamBaseUrl,
    upstreamApiKeyHint: cfg.upstreamApiKey ? `set (${cfg.upstreamApiKey.length} chars)` : "empty",
    localApiKeys: cfg.localApiKeys,
    adminApiKeys: cfg.adminApiKeys,
    allowedModels: cfg.allowedModels,
    requestTimeoutMs: cfg.requestTimeoutMs,
    disableStreaming: cfg.disableStreaming
  });
});

app.put("/admin/config", async (req, reply) => {
  const cfg = configManager.getEffective();
  enforceAdminAuthOrThrow({
    adminApiKeys: cfg.adminApiKeys,
    listenHost: listen.listenHost,
    remoteAddress: req.ip,
    headers: req.headers
  });

  const body = req.body && typeof req.body === "object" ? req.body : {};

  const updated = await configManager.update({
    upstreamBaseUrl: body.upstreamBaseUrl,
    upstreamApiKey: body.upstreamApiKey,
    localApiKeys: body.localApiKeys,
    adminApiKeys: body.adminApiKeys,
    allowedModels: body.allowedModels,
    requestTimeoutMs: body.requestTimeoutMs,
    disableStreaming: body.disableStreaming
  });

  reply.send({ ok: true, configured: updated.configured });
});

app.get("/v1/models", async (req, reply) => {
  const cfg = configManager.getEffective();
  enforceLocalAuthOrThrow(cfg, req.headers);
  reply.send(buildModelsResponse(cfg.allowedModels));
});

app.post("/v1/messages", async (req, reply) => {
  const cfg = configManager.getEffective();
  if (!cfg.configured) {
    reply.code(503).send({
      type: "error",
      error: {
        type: "invalid_request_error",
        message: "Gateway is not configured. Open /admin to set upstreamBaseUrl/upstreamApiKey."
      }
    });
    return;
  }

  enforceLocalAuthOrThrow(cfg, req.headers);

  const reqBody = req.body && typeof req.body === "object" ? req.body : {};

  const resolvedModel = resolveModelOrThrow({
    requestedModel: reqBody.model,
    allowedModels: cfg.allowedModels,
    thinking: reqBody.thinking
  });

  const upstreamBody = anthropicToUpstreamChatBody(reqBody, resolvedModel);

  const upstreamRes = await callUpstreamChatCompletions({
    upstreamBaseUrl: cfg.upstreamBaseUrl,
    upstreamApiKey: cfg.upstreamApiKey,
    body: upstreamBody,
    timeoutMs: cfg.requestTimeoutMs
  });

  if (!upstreamRes.ok) {
    const text = await upstreamRes.text().catch(() => "");
    reply.code(upstreamRes.status);
    reply.send({
      type: "error",
      error: {
        type: "upstream_error",
        message: text || `Upstream error: HTTP ${upstreamRes.status}`
      }
    });
    return;
  }

  if (reqBody.stream && cfg.disableStreaming) {
    reply.code(400).send({
      type: "error",
      error: {
        type: "invalid_request_error",
        message: "Streaming is disabled on this gateway. Remove stream=true."
      }
    });
    return;
  }

  if (reqBody.stream) {
    reply.hijack();

    let cancelled = false;
    const safeCancel = () => {
      if (cancelled) return;
      cancelled = true;
      try {
        // If a reader is already locked, cancel can throw "ReadableStream is locked".
        // In that case, just ignore: the pipe will end naturally.
        if (upstreamRes.body && !upstreamRes.body.locked && typeof upstreamRes.body.cancel === "function") {
          upstreamRes.body.cancel();
        }
      } catch {
        // ignore
      }
    };
    reply.raw.on("close", safeCancel);
    reply.raw.on("error", safeCancel);
    await pipeOpenAIStreamToAnthropic({
      upstreamResponse: upstreamRes,
      replyRaw: reply.raw,
      resolvedModel
    });
    return;
  }

  const upstreamJson = await upstreamRes.json();
  reply.send(upstreamToAnthropicMessage(upstreamJson, resolvedModel));
});

app.setErrorHandler((err, req, reply) => {
  const status = err.statusCode || 500;
  const message = status === 500 ? "Internal Server Error" : err.message;
  req.log.error({ err, headers: redactHeaders(req.headers) }, "request error");
  reply.code(status).send({
    type: "error",
    error: {
      type: status === 401 ? "unauthorized" : "invalid_request_error",
      message
    }
  });
});

await app.listen({ host: listen.listenHost, port: listen.listenPort });
app.log.info(
  {
    host: listen.listenHost,
    port: listen.listenPort,
    upstream: configManager.getEffective().upstreamBaseUrl,
    allowedModels: configManager.getEffective().allowedModels.length
  },
  "gateway listening"
);
