export async function callUpstreamChatCompletions({
  upstreamBaseUrl,
  upstreamApiKey,
  body,
  timeoutMs
}) {
  const url = `${upstreamBaseUrl}/v1/chat/completions`;
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
