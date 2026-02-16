import { randomId, safeJsonParse } from "./util.js";
import { mapFinishReason } from "./anthropic.js";

export async function pipeOpenAIStreamToAnthropic({
  upstreamResponse,
  replyRaw,
  resolvedModel
}) {
  replyRaw.setHeader("content-type", "text/event-stream; charset=utf-8");
  replyRaw.setHeader("cache-control", "no-cache");
  replyRaw.setHeader("connection", "keep-alive");

  let started = false;
  let sentTextStart = false;
  const toolStates = new Map();
  let upstreamId = "";
  let stopReason = null;

  const ensureMessageStart = () => {
    if (started) return;
    started = true;
    const id = upstreamId || randomId("msg");
    writeEvent(replyRaw, "message_start", {
      type: "message_start",
      message: {
        id,
        type: "message",
        role: "assistant",
        model: resolvedModel,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 }
      }
    });
  };

  const ensureTextBlockStart = () => {
    if (sentTextStart) return;
    sentTextStart = true;
    writeEvent(replyRaw, "content_block_start", {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" }
    });
  };

  for await (const data of iterateOpenAISSE(upstreamResponse)) {
    if (data === "[DONE]") break;
    if (!data || typeof data !== "object") continue;

    if (!upstreamId && typeof data.id === "string") upstreamId = data.id;

    const choice = data.choices && data.choices[0];
    if (!choice) continue;

    if (choice.finish_reason) {
      stopReason = mapFinishReason(choice.finish_reason);
    }

    const delta = choice.delta || {};

    const deltaContent = typeof delta.content === "string" ? delta.content : "";
    if (deltaContent) {
      ensureMessageStart();
      ensureTextBlockStart();
      writeEvent(replyRaw, "content_block_delta", {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: deltaContent }
      });
    }

    if (Array.isArray(delta.tool_calls)) {
      ensureMessageStart();
      // Some clients are sensitive to content block ordering; ensure index 0 exists.
      ensureTextBlockStart();
      for (const tc of delta.tool_calls) {
        if (!tc || typeof tc.index !== "number") continue;
        const toolIndex = tc.index;
        const eventIndex = 1 + toolIndex;

        const prev = toolStates.get(toolIndex) || {
          started: false,
          id: "",
          name: "",
          argsBuf: ""
        };

        const id = tc.id || prev.id || randomId("toolu");
        const name =
          (tc.function && tc.function.name) || prev.name || "";

        const argChunk =
          tc.function && typeof tc.function.arguments === "string"
            ? tc.function.arguments
            : "";

        if (!prev.started) {
          toolStates.set(toolIndex, { started: true, id, name, argsBuf: prev.argsBuf + argChunk });
          writeEvent(replyRaw, "content_block_start", {
            type: "content_block_start",
            index: eventIndex,
            content_block: { type: "tool_use", id, name, input: {} }
          });
        } else {
          toolStates.set(toolIndex, { started: true, id, name, argsBuf: prev.argsBuf + argChunk });
        }
      }
    }
  }

  ensureMessageStart();

  // Flush tool arguments as a single complete JSON blob per tool.
  // This avoids clients trying to JSON.parse partial fragments and losing required fields.
  for (const [toolIndex, st] of toolStates) {
    const eventIndex = 1 + toolIndex;
    const partialJson = (st && typeof st.argsBuf === "string" && st.argsBuf.trim()) ? st.argsBuf : "{}";
    writeEvent(replyRaw, "content_block_delta", {
      type: "content_block_delta",
      index: eventIndex,
      delta: { type: "input_json_delta", partial_json: partialJson }
    });
  }

  if (sentTextStart) {
    writeEvent(replyRaw, "content_block_stop", {
      type: "content_block_stop",
      index: 0
    });
  }
  for (const [toolIndex] of toolStates) {
    writeEvent(replyRaw, "content_block_stop", {
      type: "content_block_stop",
      index: 1 + toolIndex
    });
  }

  writeEvent(replyRaw, "message_delta", {
    type: "message_delta",
    delta: {
      stop_reason: stopReason,
      stop_sequence: null
    },
    usage: { output_tokens: 0 }
  });

  writeEvent(replyRaw, "message_stop", { type: "message_stop" });
  replyRaw.end();
}

function writeEvent(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function* iterateOpenAISSE(upstreamResponse) {
  const reader = upstreamResponse.body && upstreamResponse.body.getReader
    ? upstreamResponse.body.getReader()
    : null;
  if (!reader) return;

  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx).replace(/\r$/, "");
      buffer = buffer.slice(idx + 1);

      if (!line) continue;
      if (line.startsWith(":")) continue;
      if (!line.startsWith("data:")) continue;

      const raw = line.slice(5).trim();
      if (raw === "[DONE]") {
        yield "[DONE]";
        return;
      }
      const parsed = safeJsonParse(raw);
      if (parsed.ok) yield parsed.value;
    }
  }
}
