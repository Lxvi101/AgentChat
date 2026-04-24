// `ProviderId` and `HostId` are single-sourced from the provider / host
// registries, adding a new provider or host automatically widens these
// unions, and TypeScript will then point at every ModelConfig that needs
// a decision.
import type { ProviderId } from "./providers";
import type { HostId } from "./hosts";

export type { ProviderId, HostId };

/** OpenAI `reasoning_effort` / `reasoning.effort` (see @ai-sdk/openai `providerOptions.openai`). */
export type OpenAIReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export interface ModelConfig {
  id: string;
  providerId: ProviderId;
  hostId: HostId;
  name: string;
  description: string;
  longDescription?: string;
  cost: 1 | 2 | 3;
  costPlus?: boolean;
  contextLimit: number;
  disabled?: boolean;
  supportsImages?: boolean;
  supportsAudio?: boolean;
  // Capability badges
  fast?: boolean;
  vision?: boolean;
  reasoning?: boolean;
  /** When set and `hostId` is `openai`, sent as `providerOptions.openai.reasoningEffort` on the chat call. */
  openaiReasoningEffort?: OpenAIReasoningEffort;
  effortControl?: boolean;
  toolCalling?: boolean;
  imageGeneration?: boolean;
  pdfComprehension?: boolean;
  // Metadata for detail panel
  developer?: string;
  knowledgeCutoff?: string;
  addedOn?: string;
}

export const MODELS: ModelConfig[] = [
  {
    id: "claude-opus-4-7",
    providerId: "anthropic",
    hostId: "anthropic",
    name: "Claude Opus 4.7",
    description:
      "Anthropic's newest flagship, 87.6% SWE-bench Verified with 1M context",
    longDescription:
      "Claude Opus 4.7 is Anthropic's most capable hybrid reasoning model, pushing the frontier for coding and AI agents. Features a 1M token context window at standard pricing, 128K max output, enhanced high-resolution vision (up to 3.75 megapixels), and a step-change in agentic coding performance over Opus 4.6.",
    cost: 3,
    contextLimit: 1_000_000,
    disabled: false,
    supportsImages: true,
    vision: true,
    reasoning: true,
    effortControl: true,
    toolCalling: true,
    pdfComprehension: true,
    developer: "Anthropic",
    knowledgeCutoff: "1/31/2026",
    addedOn: "4/16/2026",
  },
  {
    id: "claude-opus-4-6",
    providerId: "anthropic",
    hostId: "anthropic",
    name: "Claude Opus 4.6",
    description: "Previous-gen Opus for complex reasoning and analysis",
    longDescription:
      "Claude Opus 4.6 is Anthropic's prior-generation flagship model, designed for complex reasoning, analysis, and creative tasks requiring deep understanding.",
    cost: 3,
    contextLimit: 200_000,
    disabled: false,
    supportsImages: true,
    vision: true,
    reasoning: true,
    effortControl: true,
    toolCalling: true,
    pdfComprehension: true,
    developer: "Anthropic",
    knowledgeCutoff: "5/31/2025",
    addedOn: "2/15/2026",
  },
  {
    id: "claude-sonnet-4-6",
    providerId: "anthropic",
    hostId: "anthropic",
    name: "Claude Sonnet 4.6",
    description: "Anthropic's latest Sonnet for real-world work",
    longDescription:
      "Claude Sonnet 4.6 balances intelligence and speed, making it ideal for everyday coding, analysis, and conversational tasks.",
    cost: 3,
    contextLimit: 200_000,
    disabled: false,
    supportsImages: true,
    fast: true,
    vision: true,
    reasoning: true,
    effortControl: true,
    toolCalling: true,
    pdfComprehension: true,
    developer: "Anthropic",
    knowledgeCutoff: "5/31/2025",
    addedOn: "2/15/2026",
  },
  {
    id: "gemini-3-flash-preview",
    providerId: "google",
    hostId: "google",
    name: "Gemini 3 Flash",
    description: "Lightning-fast with surprising capability",
    longDescription:
      "Gemini 3 Flash delivers strong multimodal performance at extremely low latency. Supports vision, tool use, and image generation.",
    cost: 1,
    contextLimit: 1_048_576,
    supportsImages: true,
    supportsAudio: true,
    fast: true,
    vision: true,
    toolCalling: true,
    imageGeneration: true,
    pdfComprehension: true,
    developer: "Google",
    knowledgeCutoff: "3/31/2025",
    addedOn: "1/20/2026",
  },
  {
    id: "grok-4.20-beta-0309-reasoning",
    providerId: "xai",
    hostId: "xai",
    name: "Grok 4.20 Beta (Reasoning)",
    description:
      "xAI's newest flagship with 2M context and multi-agent capabilities",
    cost: 3,
    contextLimit: 2_000_000,
    supportsImages: true,
    vision: true,
    reasoning: true,
    toolCalling: true,
  },
  {
    id: "grok-4-0709",
    providerId: "xai",
    hostId: "xai",
    name: "Grok 4",
    description: "xAI's powerful reasoning model with 256K context",
    cost: 3,
    contextLimit: 256_000,
    supportsImages: true,
    vision: true,
    reasoning: true,
    toolCalling: true,
  },
  {
    id: "grok-4-1-fast-reasoning",
    providerId: "xai",
    hostId: "xai",
    name: "Grok 4.1 Fast (Reasoning)",
    description: "Fast and cheap reasoning with 2M context window",
    cost: 1,
    contextLimit: 2_000_000,
    supportsImages: true,
    fast: true,
    vision: true,
    reasoning: true,
    toolCalling: true,
  },
  {
    id: "grok-code-fast-1",
    providerId: "xai",
    hostId: "xai",
    name: "Grok Code Fast",
    description: "Speedy reasoning model optimized for agentic coding",
    cost: 1,
    contextLimit: 256_000,
    fast: true,
    reasoning: true,
    toolCalling: true,
  },
  {
    id: "grok-3",
    providerId: "xai",
    hostId: "xai",
    name: "Grok 3",
    description: "xAI's generally available flagship model",
    cost: 3,
    contextLimit: 131_072,
    toolCalling: true,
  },
  {
    id: "grok-3-mini",
    providerId: "xai",
    hostId: "xai",
    name: "Grok 3 Mini",
    description: "Lightweight and affordable reasoning model",
    cost: 1,
    contextLimit: 131_072,
    reasoning: true,
    toolCalling: true,
  },
  {
    id: "openai/gpt-oss-20b",
    providerId: "openai",
    hostId: "groq",
    name: "GPT OSS 20B",
    description: "Fast and affordable open-source model by OpenAI",
    cost: 1,
    contextLimit: 131_072,
    fast: true,
    toolCalling: true,
  },
  {
    id: "openai/gpt-oss-120b",
    providerId: "openai",
    hostId: "groq",
    name: "GPT OSS 120B",
    description: "Fast and affordable open-source model by OpenAI",
    cost: 1,
    contextLimit: 131_072,
    fast: true,
    toolCalling: true,
  },
  {
    id: "deepseek-v4-pro",
    providerId: "deepseek",
    hostId: "deepseek",
    name: "DeepSeek V4 Pro",
    description:
      "DeepSeek's flagship V4 with 1M context and thinking mode",
    longDescription:
      "DeepSeek V4 Pro is DeepSeek's most capable model, offering a 1M token context window, 384K max output, hybrid thinking mode, JSON output, and tool calling. Served directly by the DeepSeek inference API.",
    cost: 2,
    contextLimit: 1_000_000,
    reasoning: true,
    toolCalling: true,
    developer: "DeepSeek",
    addedOn: "4/24/2026",
  },
  {
    id: "deepseek-v4-flash",
    providerId: "deepseek",
    hostId: "deepseek",
    name: "DeepSeek V4 Flash",
    description:
      "Fast and cheap V4 variant with 1M context and thinking mode",
    longDescription:
      "DeepSeek V4 Flash is the low-latency, low-cost variant of V4. Matches V4 Pro's 1M token context window and 384K max output while delivering faster responses. Supports thinking mode, JSON output, and tool calling. Served directly by the DeepSeek inference API.",
    cost: 1,
    contextLimit: 1_000_000,
    fast: true,
    reasoning: true,
    toolCalling: true,
    developer: "DeepSeek",
    addedOn: "4/24/2026",
  },
  {
    id: "accounts/fireworks/models/deepseek-v3p2",
    providerId: "deepseek",
    hostId: "fireworks",
    name: "DeepSeek V3.2",
    description:
      "Superior reasoning and agent performance with MoE architecture",
    cost: 2,
    contextLimit: 163_840,
    reasoning: true,
    toolCalling: true,
  },
  {
    id: "accounts/fireworks/models/minimax-m2p7",
    providerId: "minimax",
    hostId: "fireworks",
    name: "MiniMax M2.7",
    description: "MiniMax's latest flagship model",
    cost: 1,
    contextLimit: 131_072,
    fast: true,
    toolCalling: true,
  },
  {
    id: "accounts/fireworks/models/minimax-m2p5",
    providerId: "minimax",
    hostId: "fireworks",
    name: "MiniMax M2.5",
    description: "MiniMax's previous-gen model",
    cost: 1,
    contextLimit: 131_072,
    fast: true,
    toolCalling: true,
  },
  {
    id: "accounts/fireworks/models/glm-5",
    providerId: "zai",
    hostId: "fireworks",
    name: "GLM-5",
    description:
      "GLM-5 is a general-purpose language model developed by Z.ai. It is a powerful model that can be used for a variety of tasks.",
    cost: 1,
    contextLimit: 131_072,
    supportsImages: true,
    vision: true,
    toolCalling: true,
  },
  {
    id: "accounts/fireworks/models/kimi-k2p6",
    providerId: "moonshot",
    hostId: "fireworks",
    name: "Kimi K2.6",
    description:
      "1T MoE with long-horizon agentic coding and 300 sub-agent swarms",
    longDescription:
      "Kimi K2.6 is Moonshot's newest flagship: a 1T-parameter MoE (32B active, 384 experts, MLA attention) natively multimodal model built for long-horizon agentic coding. Scales to 300 parallel sub-agents and 4,000 coordinated steps, with strong scores on SWE-Bench Pro (58.6) and HLE-Full with tools (54.0). Open-weights under a modified MIT license.",
    cost: 2,
    contextLimit: 262_144,
    supportsImages: true,
    vision: true,
    reasoning: true,
    toolCalling: true,
    developer: "Moonshot AI",
    knowledgeCutoff: "1/31/2026",
    addedOn: "4/20/2026",
  },
  {
    id: "accounts/fireworks/models/kimi-k2p5",
    providerId: "moonshot",
    hostId: "fireworks",
    name: "Kimi K2.5",
    description:
      "Moonshot's previous flagship with 256K context, MoE architecture",
    cost: 2,
    contextLimit: 262_144,
    supportsImages: true,
    vision: true,
    reasoning: true,
    toolCalling: true,
  },
  {
    id: "moonshotai/kimi-k2-0905",
    providerId: "moonshot",
    hostId: "openrouter",
    name: "Kimi K2",
    description: "Fast and affordable quality model",
    cost: 2,
    contextLimit: 262_144,
    supportsImages: true,
    vision: true,
    toolCalling: true,
  },
  {
    id: "llama-3.1-8b-instant",
    providerId: "meta",
    hostId: "groq",
    name: "Llama 3.1 8B Instant",
    description:
      "Llama 3.1 8B Instant is a general-purpose language model developed by Meta. It is a super fast model that can be used for a variety of tasks.",
    cost: 2,
    contextLimit: 128_000,
    fast: true,
    toolCalling: true,
  },
  {
    id: "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B",
    providerId: "nvidia",
    hostId: "deepinfra",
    name: "Nemotron 3 Super",
    description: "NVIDIA's blazingly fast 120B parameter model.",
    cost: 2,
    contextLimit: 4096,
    toolCalling: true,
  },
  {
    id: "nvidia/Nemotron-3-Nano-30B-A3B",
    providerId: "nvidia",
    hostId: "deepinfra",
    name: "Nemotron 3 Nano",
    description: "NVIDIA's blazingly fast 30B parameter model.",
    cost: 2,
    contextLimit: 4096,
    toolCalling: true,
  },
  {
    id: "inception/mercury-2",
    providerId: "inception",
    hostId: "openrouter",
    name: "Mercury 2",
    description:
      "Inception's diffusion LLM, ultra-fast parallel token generation via OpenRouter",
    longDescription:
      "Mercury 2 is Inception Labs' next-generation diffusion-based large language model. Unlike autoregressive models that emit tokens one at a time, Mercury generates multiple tokens in parallel via iterative denoising, delivering order-of-magnitude faster throughput while maintaining competitive quality. Served through OpenRouter.",
    cost: 1,
    contextLimit: 131_072,
    fast: true,
    reasoning: true,
    toolCalling: true,
    developer: "Inception Labs",
    addedOn: "4/21/2026",
  },
  {
    id: "xiaomi/mimo-v2-flash",
    providerId: "xiaomi",
    hostId: "openrouter",
    name: "MiMo V2 Flash",
    description: "Xiaomi's ultra-fast reasoning model via OpenRouter",
    cost: 1,
    contextLimit: 131_072,
    fast: true,
    reasoning: true,
    toolCalling: true,
  },
  {
    id: "xiaomi/mimo-v2-pro",
    providerId: "xiaomi",
    hostId: "openrouter",
    name: "MiMo V2 Pro",
    description: "Xiaomi's flagship MiMo reasoning model via OpenRouter",
    longDescription:
      "MiMo V2 Pro is Xiaomi's top-tier reasoning model, offering deeper chain-of-thought and stronger tool use than MiMo V2 Flash at the cost of higher latency. Served through OpenRouter.",
    cost: 2,
    contextLimit: 131_072,
    reasoning: true,
    toolCalling: true,
    developer: "Xiaomi",
    addedOn: "4/21/2026",
  },
  {
    id: "minimax/minimax-m2.5",
    providerId: "minimax",
    hostId: "openrouter",
    name: "MiniMax M2.5",
    description: "MiniMax's M2.5 general-purpose model via OpenRouter",
    cost: 1,
    contextLimit: 131_072,
    fast: true,
    toolCalling: true,
    developer: "MiniMax",
    addedOn: "4/21/2026",
  },
  {
    id: "z-ai/glm-5.1",
    providerId: "zai",
    hostId: "openrouter",
    name: "GLM 5.1",
    description: "Z.ai's upgraded GLM-5.1 flagship via OpenRouter",
    longDescription:
      "GLM 5.1 is Z.ai's next iteration of the GLM series, with improved reasoning, multilingual capabilities, and tool use over GLM-5. Served through OpenRouter with routing across providers.",
    cost: 2,
    contextLimit: 131_072,
    supportsImages: true,
    vision: true,
    reasoning: true,
    toolCalling: true,
    developer: "Z.ai",
    addedOn: "4/21/2026",
  },
  {
    id: "stepfun/step-3.5-flash",
    providerId: "stepfun",
    hostId: "openrouter",
    name: "Step 3.5 Flash",
    description: "StepFun's fast general-purpose model via OpenRouter",
    longDescription:
      "Step 3.5 Flash is StepFun's low-latency general-purpose model optimized for high-throughput workloads. Served through OpenRouter.",
    cost: 1,
    contextLimit: 131_072,
    fast: true,
    toolCalling: true,
    developer: "StepFun",
    addedOn: "4/21/2026",
  },
  {
    id: "qwen/qwen3.6-plus",
    providerId: "alibaba",
    hostId: "openrouter",
    name: "Qwen 3.6 Plus",
    description: "Alibaba's flagship Qwen 3.6 Plus model via OpenRouter",
    longDescription:
      "Qwen 3.6 Plus is Alibaba's upgraded flagship in the Qwen 3 series, with stronger reasoning, tool use, and multilingual performance. Served through OpenRouter.",
    cost: 2,
    contextLimit: 131_072,
    reasoning: true,
    toolCalling: true,
    developer: "Alibaba Qwen",
    addedOn: "4/21/2026",
  },
  {
    id: "qwen/qwen3.5-flash-02-23",
    providerId: "alibaba",
    hostId: "openrouter",
    name: "Qwen 3.5 Flash",
    description:
      "Alibaba's fast, cost-efficient Qwen 3.5 Flash model via OpenRouter",
    longDescription:
      "Qwen 3.5 Flash (02-23 revision) is Alibaba's speed-optimized variant in the Qwen 3.5 series, tuned for low-latency reasoning, tool use, and high-throughput workloads. Served through OpenRouter.",
    cost: 1,
    contextLimit: 131_072,
    fast: true,
    reasoning: true,
    toolCalling: true,
    developer: "Alibaba Qwen",
    addedOn: "4/21/2026",
  },
  {
    id: "google/gemma-4-31b-it",
    providerId: "google",
    hostId: "openrouter",
    name: "Gemma 4 31B",
    description:
      "Google DeepMind's multimodal instruct model with long context via OpenRouter",
    longDescription:
      "Gemma 4 31B Instruct is a dense multimodal model supporting text and image input, native function calling, and configurable reasoning. Served through OpenRouter with routing across providers.",
    cost: 1,
    contextLimit: 262_144,
    supportsImages: true,
    vision: true,
    reasoning: true,
    toolCalling: true,
    developer: "Google",
    knowledgeCutoff: "1/31/2026",
    addedOn: "4/9/2026",
  },
  {
    id: "gemini-2.0-flash",
    providerId: "google",
    hostId: "google",
    name: "Gemini 2.0 Flash",
    description:
      "Google's frontier reasoning model delivering enhanced software engineering and multimodal intelligence",
    cost: 1,
    contextLimit: 1_048_576,
    supportsImages: true,
    supportsAudio: true,
    fast: true,
    vision: true,
    toolCalling: true,
    pdfComprehension: true,
    developer: "Google",
  },
  {
    id: "gemini-3.1-flash-lite-preview",
    providerId: "google",
    hostId: "google",
    name: "Gemini 3.1 Flash-Lite",
    description:
      "Google's fastest and most cost-efficient model in the Gemini 3 series for high-volume workloads",
    cost: 1,
    contextLimit: 1_048_576,
    fast: true,
    reasoning: true,
    toolCalling: true,
    developer: "Google",
  },
  {
    id: "gemini-3.1-pro",
    providerId: "google",
    hostId: "google",
    name: "Gemini 3.1 Pro",
    description:
      "Google's most capable AI model with major advances in reasoning, coding, and agentic intelligence",
    cost: 3,
    contextLimit: 1_048_576,
    supportsImages: true,
    vision: true,
    reasoning: true,
    toolCalling: true,
    pdfComprehension: true,
    developer: "Google",
  },
  {
    id: "llama-4-scout-17b-16e",
    providerId: "meta",
    hostId: "groq",
    name: "Llama 4 Scout",
    description:
      "Meta's natively multimodal MoE model with an industry-leading 10M context window",
    cost: 2,
    contextLimit: 10_000_000,
    supportsImages: true,
    vision: true,
    toolCalling: true,
    developer: "Meta",
  },
  {
    id: "gpt-5.3-instant",
    providerId: "openai",
    hostId: "openai",
    name: "GPT-5.3 Instant",
    description:
      "Faster, lower-latency GPT-5.3 with light reasoning for quick replies",
    cost: 2,
    contextLimit: 256_000,
    supportsImages: true,
    vision: true,
    fast: true,
    reasoning: false,
    openaiReasoningEffort: "none",
    toolCalling: true,
    pdfComprehension: true,
    developer: "OpenAI",
  },
  {
    id: "gpt-5.4-mini",
    providerId: "openai",
    hostId: "openai",
    name: "GPT-5.4 Mini",
    description:
      "Fast and efficient for high-volume workloads with improved coding and reasoning",
    cost: 1,
    contextLimit: 128_000,
    supportsImages: true,
    vision: true,
    fast: true,
    reasoning: true,
    toolCalling: true,
    developer: "OpenAI",
  },
  {
    id: "gpt-5.4-nano",
    providerId: "openai",
    hostId: "openai",
    name: "GPT-5.4 Nano",
    description:
      "The smallest, cheapest version of GPT-5.4 for tasks where speed and cost matter most",
    cost: 1,
    contextLimit: 128_000,
    fast: true,
    toolCalling: true,
    developer: "OpenAI",
  },
  {
    id: "gpt-5.4",
    providerId: "openai",
    hostId: "openai",
    name: "GPT-5.4",
    description:
      "OpenAI's frontier model for complex professional work with a 1.05M context window",
    cost: 3,
    contextLimit: 1_050_000,
    supportsImages: true,
    vision: true,
    reasoning: true,
    toolCalling: true,
    pdfComprehension: true,
    developer: "OpenAI",
  },
  {
    id: "claude-haiku-4-5",
    providerId: "anthropic",
    hostId: "anthropic",
    name: "Claude Haiku 4.5",
    description:
      "Anthropic's fastest model featuring extended thinking and context awareness",
    cost: 1,
    contextLimit: 200_000,
    supportsImages: true,
    vision: true,
    fast: true,
    reasoning: true,
    toolCalling: true,
    developer: "Anthropic",
  },
];

export function getModelConfig(modelId: string): ModelConfig | undefined {
  return MODELS.find((m) => m.id === modelId);
}

/**
 * Per-message provider options for the SYSTEM message. Enables Anthropic
 * prompt caching on the system prompt (which includes the agent prompt and
 * any included text files, the "static prefix" of the conversation).
 *
 * Cache writes cost ~25% more, cache reads cost ~90% less, and TTFT drops
 * significantly on cache hits. Only applied to Anthropic-hosted models; the
 * Anthropic SDK validates the type against our message shape automatically.
 *
 * Note: Anthropic caches the prefix up to & including this breakpoint, and
 * requires a minimum cacheable length (1024 tokens for Haiku, 2048 for
 * Sonnet/Opus). Short system prompts won't hit the cache, that's fine,
 * Anthropic just silently skips caching in that case.
 *
 * Returns `undefined` for non-Anthropic hosts so callers can spread the
 * result without conditional logic: `providerOptions: fn(model)`.
 */
export function getSystemMessageProviderOptions(modelName: string):
  | { anthropic: { cacheControl: { type: "ephemeral" } } }
  | undefined {
  const cfg = getModelConfig(modelName);
  if (!cfg) return undefined;
  if (cfg.hostId === "anthropic") {
    return { anthropic: { cacheControl: { type: "ephemeral" } } };
  }
  return undefined;
}

/**
 * Options merged into Vercel AI `streamText` for supported hosts (OpenAI reasoning
 * effort, OpenRouter thinking). Safe to spread onto the `streamText` call.
 */
export function getStreamTextProviderOptions(modelName: string):
  | {
      providerOptions: {
        openai?: { reasoningEffort: OpenAIReasoningEffort };
        openrouter?: { reasoning: { effort: "medium" } };
      };
    }
  | object {
  const modelCfg = getModelConfig(modelName);
  if (!modelCfg) return {};

  const providerOptions: {
    openai?: { reasoningEffort: OpenAIReasoningEffort };
    openrouter?: { reasoning: { effort: "medium" } };
  } = {};

  if (modelCfg.hostId === "openai" && modelCfg.openaiReasoningEffort != null) {
    providerOptions.openai = {
      reasoningEffort: modelCfg.openaiReasoningEffort,
    };
  }

  if (modelCfg.hostId === "openrouter" && modelCfg.reasoning === true) {
    providerOptions.openrouter = { reasoning: { effort: "medium" } };
  }

  if (Object.keys(providerOptions).length === 0) {
    return {};
  }

  return { providerOptions };
}

export function getModelContextLimit(modelId: string): number {
  return getModelConfig(modelId)?.contextLimit ?? 128_000;
}
