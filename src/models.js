export function buildModelsResponse(allowedModels) {
  // Minimal Anthropic-compatible shape.
  // Many clients only need `data[].id`.
  return {
    data: allowedModels.map((id) => ({
      id,
      type: "model"
    }))
  };
}

export function defaultAllowedModels() {
  return [
    "claude-3-5-haiku-20241022",
    "claude-3-5-sonnet-20240620",
    "claude-3-5-sonnet-20241022",
    "claude-3-7-sonnet-20250219",
    "claude-3-7-sonnet-20250219-thinking",
    "claude-3-opus-20240229",
    "claude-haiku-4-5-20251001",
    "claude-haiku-4-5-20251001-thinking",
    "claude-opus-4-1-20250805",
    "claude-opus-4-1-20250805-thinking",
    "claude-opus-4-20250514",
    "claude-opus-4-20250514-thinking",
    "claude-opus-4-5-20251101",
    "claude-opus-4-5-20251101-thinking",
    "claude-opus-4-6",
    "claude-sonnet-4-20250514",
    "claude-sonnet-4-20250514-thinking",
    "claude-sonnet-4-5-20250929",
    "claude-sonnet-4-5-20250929-thinking"
  ];
}

export function resolveModelOrThrow({ requestedModel, allowedModels, thinking }) {
  if (!requestedModel || typeof requestedModel !== "string") {
    const err = new Error("model is required");
    err.statusCode = 400;
    throw err;
  }

  const allowed = new Set(allowedModels);
  let model = requestedModel;

  // Optional: Anthropic-style thinking flag -> prefer -thinking model suffix.
  // If user requests thinking and the -thinking variant exists in allowed set, switch to it.
  // If user disables thinking, prefer non-thinking variant.
  const thinkingEnabled =
    thinking && typeof thinking === "object" && thinking.type === "enabled";
  const thinkingDisabled =
    thinking && typeof thinking === "object" && thinking.type === "disabled";

  if (thinkingEnabled && !model.endsWith("-thinking")) {
    const candidate = `${model}-thinking`;
    if (allowed.has(candidate)) model = candidate;
  }
  if (thinkingDisabled && model.endsWith("-thinking")) {
    const candidate = model.replace(/-thinking$/, "");
    if (allowed.has(candidate)) model = candidate;
  }

  if (!allowed.has(model)) {
    const err = new Error(`model not allowed: ${model}`);
    err.statusCode = 400;
    throw err;
  }

  return model;
}
