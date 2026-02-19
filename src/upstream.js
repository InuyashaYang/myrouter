export async function callUpstreamChatCompletions({
  upstreamBaseUrl,
  upstreamApiKey,
  body,
  timeoutMs
}) {
  return callUpstreamPath({
    upstreamBaseUrl,
    upstreamApiKey,
    path: "/v1/chat/completions",
    body,
    timeoutMs
  });
}

export async function callUpstreamResponses({
  upstreamBaseUrl,
  upstreamApiKey,
  body,
  timeoutMs
}) {
  return callUpstreamPath({
    upstreamBaseUrl,
    upstreamApiKey,
    path: "/v1/responses",
    body,
    timeoutMs
  });
}

async function callUpstreamPath({
  upstreamBaseUrl,
  upstreamApiKey,
  path,
  body,
  timeoutMs
}) {
  const url = `${upstreamBaseUrl}${path}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {
      "content-type": "application/json",
      authorization: `Bearer ${upstreamApiKey}`
    };
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
    return { res, url, headers, body };
  } finally {
    clearTimeout(t);
  }
}
