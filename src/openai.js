export function openAIResponsesToUpstreamChatBody(reqBody, resolvedModel) {
  const input = reqBody.input;
  let messages = [];

  if (typeof input === "string") {
    messages = [{ role: "user", content: input }];
  } else if (Array.isArray(input)) {
    messages = input
      .flatMap((m) => extractMessagesFromInput(m))
      .filter(Boolean);
  } else {
    messages = reqBody.messages || [];
  }

  const body = {
    model: resolvedModel,
    messages,
    max_tokens: reqBody.max_output_tokens || reqBody.max_tokens,
    temperature: reqBody.temperature,
    top_p: reqBody.top_p,
    stream: !!reqBody.stream
  };

  if (Array.isArray(reqBody.tools) && reqBody.tools.length) {
    body.tools = reqBody.tools;
  }

  return body;
}

function extractMessagesFromInput(item) {
  if (!item || typeof item !== "object") return [];

  if (item.role && typeof item.content === "string") {
    return [{ role: item.role, content: item.content }];
  }

  if (item.type === "input_text" && typeof item.text === "string") {
    return [{ role: "user", content: item.text }];
  }

  if (item.type === "message") {
    const role = item.role || "user";
    if (typeof item.content === "string") {
      return [{ role, content: item.content }];
    }
    if (Array.isArray(item.content)) {
      const text = item.content
        .map((c) => {
          if (!c || typeof c !== "object") return "";
          if (c.type === "input_text" && typeof c.text === "string") return c.text;
          if (c.type === "text" && typeof c.text === "string") return c.text;
          if (typeof c.text === "string") return c.text;
          return "";
        })
        .join("")
        .trim();
      if (text) return [{ role, content: text }];
    }
  }

  return [];
}

export function upstreamChatToOpenAIResponse(upstreamJson, resolvedModel) {
  const choice = upstreamJson && upstreamJson.choices && upstreamJson.choices[0];
  const msg = choice && choice.message ? choice.message : {};
  const text = typeof msg.content === "string" ? msg.content : "";
  const id = upstreamJson && upstreamJson.id ? upstreamJson.id : `resp_${Date.now()}`;
  const createdAt = upstreamJson && upstreamJson.created ? upstreamJson.created : Math.floor(Date.now() / 1000);

  return {
    id,
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
            text
          }
        ]
      }
    ],
    usage: upstreamJson && upstreamJson.usage ? upstreamJson.usage : undefined
  };
}
