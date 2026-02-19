export function openAIResponsesToUpstreamChatBody(reqBody, resolvedModel) {
  const input = reqBody.input;
  let messages = [];

  if (typeof input === "string") {
    messages = [{ role: "user", content: input }];
  } else if (Array.isArray(input)) {
    messages = input
      .map((m) => {
        if (!m || typeof m !== "object") return null;
        if (m.role && typeof m.content === "string") return { role: m.role, content: m.content };
        if (m.type === "input_text" && typeof m.text === "string") return { role: "user", content: m.text };
        return null;
      })
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

export function upstreamChatToOpenAIResponse(upstreamJson, resolvedModel) {
  const choice = upstreamJson && upstreamJson.choices && upstreamJson.choices[0];
  const msg = choice && choice.message ? choice.message : {};
  const text = typeof msg.content === "string" ? msg.content : "";
  const id = upstreamJson && upstreamJson.id ? upstreamJson.id : `resp_${Date.now()}`;

  return {
    id,
    object: "response",
    created: upstreamJson && upstreamJson.created ? upstreamJson.created : Math.floor(Date.now() / 1000),
    model: resolvedModel,
    output_text: text,
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
