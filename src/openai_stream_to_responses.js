import { randomId, safeJsonParse } from "./util.js";

export async function pipeOpenAIStreamToResponses({
  upstreamResponse,
  replyRaw,
  resolvedModel
}) {
  replyRaw.setHeader("content-type", "text/event-stream; charset=utf-8");
  replyRaw.setHeader("cache-control", "no-cache");
  replyRaw.setHeader("connection", "keep-alive");

  let responseId = randomId("resp");
  let createdAt = Math.floor(Date.now() / 1000);
  let upstreamId = "";
  let outputText = "";
  let started = false;

  const ensureCreated = () => {
    if (started) return;
    started = true;
    if (upstreamId) responseId = upstreamId;
    writeEvent(replyRaw, "response.created", {
      type: "response.created",
      response: {
        id: responseId,
        object: "response",
        created_at: createdAt,
        status: "in_progress",
        model: resolvedModel,
        output: []
      }
    });
  };

  for await (const data of iterateOpenAISSE(upstreamResponse)) {
    if (data === "[DONE]") break;
    if (!data || typeof data !== "object") continue;

    if (!upstreamId && typeof data.id === "string") {
      upstreamId = data.id;
      if (started) responseId = upstreamId;
    }

    const choice = data.choices && data.choices[0];
    if (!choice) continue;

    const delta = choice.delta || {};
    const deltaContent = typeof delta.content === "string" ? delta.content : "";

    if (deltaContent) {
      ensureCreated();
      outputText += deltaContent;
      writeEvent(replyRaw, "response.output_text.delta", {
        type: "response.output_text.delta",
        delta: deltaContent,
        response_id: responseId,
        output_index: 0,
        content_index: 0
      });
    }
  }

  ensureCreated();

  const response = buildResponseObject({
    responseId,
    createdAt,
    resolvedModel,
    outputText
  });

  writeEvent(replyRaw, "response.completed", {
    type: "response.completed",
    response
  });

  writeDone(replyRaw);
  replyRaw.end();
}

export async function pipeUpstreamSSE({ upstreamResponse, replyRaw }) {
  const contentType = upstreamResponse.headers.get("content-type") || "text/event-stream; charset=utf-8";
  replyRaw.setHeader("content-type", contentType);
  replyRaw.setHeader("cache-control", "no-cache");
  replyRaw.setHeader("connection", "keep-alive");

  const reader = upstreamResponse.body && upstreamResponse.body.getReader
    ? upstreamResponse.body.getReader()
    : null;
  if (!reader) {
    replyRaw.end();
    return;
  }

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      replyRaw.write(value);
    }
  } finally {
    replyRaw.end();
  }
}

function buildResponseObject({ responseId, createdAt, resolvedModel, outputText }) {
  return {
    id: responseId,
    object: "response",
    created_at: createdAt,
    status: "completed",
    model: resolvedModel,
    output: [
      {
        type: "message",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: outputText
          }
        ]
      }
    ]
  };
}

function writeEvent(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function writeDone(res) {
  res.write("data: [DONE]\n\n");
}

async function* iterateOpenAISSE(upstreamResponse) {
  const reader = upstreamResponse.body && upstreamResponse.body.getReader
    ? upstreamResponse.body.getReader()
    : null;
  if (!reader) return;

  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let dataLines = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      let line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);

      line = line.replace(/\r$/, "");

      if (line === "") {
        if (dataLines.length) {
          const raw = dataLines.join("\n").trim();
          dataLines = [];
          if (raw === "[DONE]") {
            yield "[DONE]";
            return;
          }
          const parsed = safeJsonParse(raw);
          if (parsed.ok) yield parsed.value;
        }
        continue;
      }

      if (line.startsWith(":")) continue;
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      }
    }
  }

  if (dataLines.length) {
    const raw = dataLines.join("\n").trim();
    if (raw === "[DONE]") {
      yield "[DONE]";
      return;
    }
    const parsed = safeJsonParse(raw);
    if (parsed.ok) yield parsed.value;
  }
}
