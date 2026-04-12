import Anthropic from "@anthropic-ai/sdk";

// Supports both the old env var name and the new one for backwards compatibility
const apiKey = process.env.ANTHROPIC_API_KEY || process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;

if (!apiKey) {
  throw new Error(
    "ANTHROPIC_API_KEY env var is required.",
  );
}

// baseURL is optional — if set, use it; otherwise SDK defaults to https://api.anthropic.com
const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || undefined;

export const anthropic = new Anthropic({
  apiKey,
  ...(baseURL ? { baseURL } : {}),
});
