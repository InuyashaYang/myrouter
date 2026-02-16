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
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${upstreamApiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}
