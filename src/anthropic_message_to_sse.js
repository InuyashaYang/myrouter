import { randomId } from "./util.js";

export async function writeAnthropicMessageAsSSE({ replyRaw, message }) {
  replyRaw.setHeader("content-type", "text/event-stream; charset=utf-8");
  replyRaw.setHeader("cache-control", "no-cache");
  replyRaw.setHeader("connection", "keep-alive");

  const msg = message && typeof message === "object" ? message : null;
  const msgId = msg && typeof msg.id === "string" && msg.id ? msg.id : randomId("msg");
  const model = msg && typeof msg.model === "string" ? msg.model : "";

  writeEvent(replyRaw, "message_start", {
    type: "message_start",
    message: {
      id: msgId,
      type: "message",
      role: "assistant",
      model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: msg && msg.usage ? msg.usage : { input_tokens: 0, output_tokens: 0 }
    }
  });

  const content = msg && Array.isArray(msg.content) ? msg.content : [];
  let index = 0;

  for (const block of content) {
    if (!block || typeof block !== "object") continue;

    if (block.type === "text") {
      writeEvent(replyRaw, "content_block_start", {
        type: "content_block_start",
        index,
        content_block: { type: "text", text: "" }
      });

      const text = typeof block.text === "string" ? block.text : "";
      if (text) {
        writeEvent(replyRaw, "content_block_delta", {
          type: "content_block_delta",
          index,
          delta: { type: "text_delta", text }
        });
      }

      writeEvent(replyRaw, "content_block_stop", {
        type: "content_block_stop",
        index
      });
      index++;
      continue;
    }

    if (block.type === "tool_use") {
      const id = typeof block.id === "string" && block.id ? block.id : randomId("toolu");
      const name = typeof block.name === "string" ? block.name : "";
      const input = block.input && typeof block.input === "object" ? block.input : {};

      writeEvent(replyRaw, "content_block_start", {
        type: "content_block_start",
        index,
        content_block: { type: "tool_use", id, name, input: {} }
      });

      writeEvent(replyRaw, "content_block_delta", {
        type: "content_block_delta",
        index,
        delta: { type: "input_json_delta", partial_json: JSON.stringify(input) }
      });

      writeEvent(replyRaw, "content_block_stop", {
        type: "content_block_stop",
        index
      });
      index++;
      continue;
    }
  }

  writeEvent(replyRaw, "message_delta", {
    type: "message_delta",
    delta: {
      stop_reason: msg && msg.stop_reason ? msg.stop_reason : "end_turn",
      stop_sequence: null
    },
    usage: { output_tokens: msg && msg.usage && msg.usage.output_tokens ? msg.usage.output_tokens : 0 }
  });

  writeEvent(replyRaw, "message_stop", { type: "message_stop" });
  replyRaw.end();
}

function writeEvent(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}
