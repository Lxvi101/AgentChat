import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // App-wide configuration settings
  appSettings: defineTable({
    key: v.string(),
    value: v.any(),
  }).index("by_key", ["key"]),

  // Synced from Better Auth via triggers
  users: defineTable({
    name: v.string(),
    email: v.string(),
    authId: v.string(), // References the Better Auth User ID
    role: v.optional(v.union(v.literal("admin"), v.literal("user"))),
    favoriteModels: v.optional(v.array(v.string())),
    autoFollowStream: v.optional(v.boolean()),
  }).index("by_authId", ["authId"]),

  // Agents, custom personas that organize threads and set conversation
  // context (system prompt + attached files) + an emoji identity.
  agents: defineTable({
    userId: v.string(),
    name: v.string(),
    emoji: v.optional(v.string()),
    systemPrompt: v.optional(v.string()),
    includedFiles: v.optional(v.array(v.id("files"))),
  }).index("by_userId", ["userId"]),

  // File metadata tracking
  files: defineTable({
    userId: v.string(),
    storageId: v.id("_storage"),
    name: v.string(),
    mimeType: v.string(),
  }).index("by_userId", ["userId"]),

  threads: defineTable({
    userId: v.string(),
    agentId: v.optional(v.id("agents")),
    isEphemeral: v.boolean(),
    isPinned: v.optional(v.boolean()),
    isArchived: v.optional(v.boolean()),
    isShared: v.optional(v.boolean()),
    isGenerating: v.optional(v.boolean()),
    title: v.optional(v.string()),
    lastModel: v.optional(v.string()),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_isArchived", ["userId", "isArchived"])
    .index("by_userId_and_isShared", ["userId", "isShared"]),

  messages: defineTable({
    threadId: v.id("threads"),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    parts: v.array(v.any()), // Supports multimodal content
    fileIds: v.optional(v.array(v.id("files"))), // Attach files directly to messages
    model: v.string(),
    restorationId: v.optional(v.string()), // The Redis stream ID for recovery
    isGenerating: v.boolean(),
    isError: v.optional(v.boolean()),
    errorMessage: v.optional(v.string()), // Short human-readable error surfaced to the UI
    searchMeta: v.optional(v.any()),
    reasoning: v.optional(v.string()), // Persisted reasoning/thinking trace text
    toolCallMeta: v.optional(v.any()), // MCP tool-call traces (start/result events)
  }).index("by_threadId", ["threadId"]),

  // Image Studio generations
  imageGenerations: defineTable({
    userId: v.string(),
    prompt: v.string(),
    modelId: v.string(),
    modelName: v.string(),
    aspectRatio: v.string(),
    resolution: v.string(),
    imageUrl: v.string(),
    width: v.number(),
    height: v.number(),
    generationTime: v.number(),
    cost: v.number(),
    seed: v.optional(v.number()),
    referenceImageUrls: v.optional(v.array(v.string())),
  }).index("by_userId", ["userId"]),
});
