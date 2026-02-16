import { randomId, safeJsonParse, toText } from "./util.js";

export function anthropicToUpstreamChatBody(reqBody, resolvedModel) {
  const systemText = toText(reqBody.system);

  const messages = [];
  if (systemText) {
    messages.push({ role: "system", content: systemText });
  }

  const srcMessages = Array.isArray(reqBody.messages) ? reqBody.messages : [];
  for (const m of srcMessages) {
    if (!m || typeof m !== "object") continue;
    if (m.role !== "user" && m.role !== "assistant") continue;

    const content = m.content;

    // Handle string-only messages.
    if (typeof content === "string") {
      messages.push({ role: m.role, content });
      continue;
    }

    // Handle block arrays (text/tool_use/tool_result).
    if (Array.isArray(content)) {
      if (m.role === "assistant") {
        const { text, toolCalls } = extractAssistantTextAndToolCalls(content);
        const msg = { role: "assistant" };
        if (text) msg.content = text;
        if (toolCalls.length) msg.tool_calls = toolCalls;
        // OpenAI requires content for assistant in some implementations; provide empty string if tool calls exist.
        if (!msg.content && msg.tool_calls) msg.content = "";
        messages.push(msg);
      } else {
        // user role: preserve order for interleaved text and tool_result blocks.
        const expanded = expandUserBlocksToOpenAIMessages(content);
        for (const em of expanded) {
          messages.push(em);
        }
      }
      continue;
    }
  }

  const body = {
    model: resolvedModel,
    messages,
    max_tokens: reqBody.max_tokens,
    temperature: reqBody.temperature,
    top_p: reqBody.top_p,
    stop: reqBody.stop_sequences,
    stream: !!reqBody.stream
  };

  const tools = Array.isArray(reqBody.tools) ? reqBody.tools : null;
  if (tools && tools.length) {
    body.tools = tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema
      }
    }));

    const toolChoice = reqBody.tool_choice;
    if (toolChoice && typeof toolChoice === "object") {
      // Anthropic: {type:"auto"|"any"|"tool", name?:string}
      if (toolChoice.type === "auto") body.tool_choice = "auto";
      else if (toolChoice.type === "any") body.tool_choice = "auto";
      else if (toolChoice.type === "tool" && toolChoice.name) {
        body.tool_choice = { type: "function", function: { name: toolChoice.name } };
      }
    }
  }

  // Clean undefined.
  for (const k of Object.keys(body)) {
    if (body[k] === undefined || body[k] === null) delete body[k];
  }

  return body;
}

function expandUserBlocksToOpenAIMessages(blocks) {
  const out = [];
  let currentText = "";

  const flushText = () => {
    if (currentText) {
      out.push({ role: "user", content: currentText });
      currentText = "";
    }
  };

  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;

    if (b.type === "text" && typeof b.text === "string") {
      currentText += b.text;
      continue;
    }

    if (b.type === "tool_result") {
      flushText();
      const toolCallId = b.tool_use_id || "";
      const text = toolResultToText(b.content);
      out.push({ role: "tool", tool_call_id: toolCallId, content: text });
      continue;
    }
  }

  flushText();
  if (out.length === 0) out.push({ role: "user", content: "" });
  return out;
}

function toolResultToText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (b && b.type === "text" && typeof b.text === "string" ? b.text : ""))
      .join("");
  }
  return "";
}

function extractAssistantTextAndToolCalls(blocks) {
  let text = "";
  const toolCalls = [];

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!b || typeof b !== "object") continue;
    if (b.type === "text" && typeof b.text === "string") {
      text += b.text;
      continue;
    }
    if (b.type === "tool_use") {
      const id = b.id || randomId("toolu");
      const name = b.name || "";
      const input = b.input && typeof b.input === "object" ? b.input : {};
      toolCalls.push({
        id,
        type: "function",
        function: { name, arguments: JSON.stringify(input) }
      });
    }
  }

  return { text, toolCalls };
}

export function upstreamToAnthropicMessage(upstreamJson, resolvedModel) {
  const choice = upstreamJson && upstreamJson.choices && upstreamJson.choices[0];
  const msg = choice && choice.message ? choice.message : {};

  const blocks = [];
  const contentText = typeof msg.content === "string" ? msg.content : "";
  if (contentText) {
    blocks.push({ type: "text", text: contentText });
  }

  if (Array.isArray(msg.tool_calls)) {
    for (const tc of msg.tool_calls) {
      if (!tc || tc.type !== "function") continue;
      const id = tc.id || randomId("toolu");
      const name = tc.function && tc.function.name ? tc.function.name : "";
      const argsStr = tc.function && typeof tc.function.arguments === "string" ? tc.function.arguments : "{}";
      const parsed = safeJsonParse(argsStr);
      blocks.push({
        type: "tool_use",
        id,
        name,
        input: parsed.ok && parsed.value && typeof parsed.value === "object" ? parsed.value : {}
      });
    }
  }

  const finishReason = choice ? choice.finish_reason : null;
  return {
    id: upstreamJson && upstreamJson.id ? upstreamJson.id : randomId("msg"),
    type: "message",
    role: "assistant",
    model: resolvedModel,
    content: blocks.length ? blocks : [{ type: "text", text: "" }],
    stop_reason: mapFinishReason(finishReason),
    stop_sequence: null,
    usage: {
      input_tokens: upstreamJson && upstreamJson.usage && upstreamJson.usage.prompt_tokens ? upstreamJson.usage.prompt_tokens : 0,
      output_tokens: upstreamJson && upstreamJson.usage && upstreamJson.usage.completion_tokens ? upstreamJson.usage.completion_tokens : 0
    }
  };
}

export function mapFinishReason(finishReason) {
  if (!finishReason) return null;
  if (finishReason === "stop") return "end_turn";
  if (finishReason === "length") return "max_tokens";
  if (finishReason === "tool_calls") return "tool_use";
  return "end_turn";
}
