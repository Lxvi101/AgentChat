// src/lib/hosts.ts
//
// Single source of truth for INFERENCE HOSTS, the services that actually run
// the model (OpenAI, Fireworks, Groq, OpenRouter, …). A "host" is separate
// from a "provider" (the lab that built the model): e.g. `kimi-k2.6` is made
// by the Moonshot *provider* but served through the Fireworks *host*.
//
// ──────────────────────────────────────────────────────────────────────────
//  Adding a new host:
//    1. `pnpm add @ai-sdk/<vendor>`
//    2. Instantiate the client at the top of this file.
//    3. Append one line to the HOSTS record below.
//  `HostId` is derived automatically, the type system will then require any
//  new host to be reachable from `models.ts` via `hostId: "<your-new-id>"`.
// ──────────────────────────────────────────────────────────────────────────

import { google } from "@ai-sdk/google";
import { createFireworks } from "@ai-sdk/fireworks";
import { createAnthropic } from "@ai-sdk/anthropic";
import { groq } from "@ai-sdk/groq";
import { createDeepInfra } from "@ai-sdk/deepinfra";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenAI } from "@ai-sdk/openai";
import { createXai } from "@ai-sdk/xai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { getModelConfig } from "./models";

// ── Client instances ─────────────────────────────────────────────────────
const fireworks = createFireworks({
  apiKey: process.env.FIREWORK_API_KEY ?? "",
});
const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
});
const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "",
});
const deepinfra = createDeepInfra({
  apiKey: process.env.DEEPINFRA_API_KEY ?? "",
});
const deepseek = createDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY ?? "",
});
const xai = createXai({
  apiKey: process.env.XAI_API_KEY ?? "",
});
// Dedicated OpenRouter provider, unlike the generic OpenAI client, this one
// knows how to surface `reasoning-delta` parts from OpenRouter's response
// (which the Vercel AI SDK needs in order to render the ThinkingBlock UI for
// Qwen, Gemma, and any other reasoning-capable model routed via OpenRouter).
const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
});

// ── Host registry ────────────────────────────────────────────────────────

export interface HostConfig {
  /** Human-readable display name (shown in model detail panels / settings). */
  name: string;
  /** Factory that returns a Vercel AI SDK `LanguageModel` for a given model id. */
  client: (modelId: string) => ReturnType<typeof google>;
}

export const HOSTS = {
  google:     { name: "Google",     client: (id) => google(id) },
  openai:     { name: "OpenAI",     client: (id) => openai(id) },
  anthropic:  { name: "Anthropic",  client: (id) => anthropic(id) },
  groq:       { name: "Groq",       client: (id) => groq(id) },
  fireworks:  { name: "Fireworks",  client: (id) => fireworks(id) },
  deepinfra:  { name: "DeepInfra",  client: (id) => deepinfra(id) },
  deepseek:   { name: "DeepSeek",   client: (id) => deepseek(id) },
  xai:        { name: "xAI",        client: (id) => xai(id) },
  openrouter: { name: "OpenRouter", client: (id) => openrouter.chat(id) },
} as const satisfies Record<string, HostConfig>;

/** Literal union of all registered host ids. Used by `ModelConfig.hostId`. */
export type HostId = keyof typeof HOSTS;

export function getHost(id: string): HostConfig | undefined {
  return (HOSTS as Record<string, HostConfig>)[id];
}

// ── Public entrypoint used by the chat API routes ────────────────────────

export function getModel(modelName: string) {
  const hostId = getModelConfig(modelName)?.hostId ?? "google";
  const host = getHost(hostId);
  if (!host) throw new Error(`No host configured for "${hostId}"`);
  return host.client(modelName);
}
