import { query, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { authComponent } from "./auth";

// Self-healing mutation: force-close zombie generating states after timeout
export const cleanupZombieState = internalMutation({
  args: {
    threadId: v.id("threads"),
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (thread?.isGenerating) {
      await ctx.db.patch(args.threadId, { isGenerating: false });
    }

    const msg = await ctx.db.get(args.messageId);
    if (msg?.isGenerating) {
      await ctx.db.patch(args.messageId, {
        isGenerating: false,
        isError: true,
        parts: [msg.parts[0] || "[Generation timed out. Please try again.]"],
      });
    }
  },
});

// 1. Start generation: Creates the user message AND the blank assistant placeholder
export const startGeneration = mutation({
  args: {
    threadId: v.id("threads"),
    userContent: v.string(),
    model: v.string(),
    restorationId: v.string(),
    fileIds: v.optional(v.array(v.id("files"))),
  },
  handler: async (ctx, args) => {
    // Insert User Message
    await ctx.db.insert("messages", {
      threadId: args.threadId,
      role: "user",
      parts: [args.userContent],
      fileIds: args.fileIds,
      model: args.model,
      isGenerating: false,
    });

    // Insert Assistant Placeholder
    const assistantMessageId = await ctx.db.insert("messages", {
      threadId: args.threadId,
      role: "assistant",
      parts: [""],
      model: args.model,
      restorationId: args.restorationId,
      isGenerating: true,
    });

    // Mark thread as actively generating and remember the model used
    await ctx.db.patch(args.threadId, { isGenerating: true, lastModel: args.model });

    // Schedule a failsafe to auto-cleanup if generation never completes (e.g. serverless kill)
    await ctx.scheduler.runAfter(120_000, internal.messages.cleanupZombieState, {
      threadId: args.threadId,
      messageId: assistantMessageId,
    });

    return assistantMessageId;
  },
});

// 2. The Chunked Fallback: Updates the assistant message every ~500ms
export const updateGeneration = mutation({
  args: {
    messageId: v.id("messages"),
    currentText: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      parts: [args.currentText],
    });
  },
});

// 3. Final Write: Marks the generation as complete
export const finishGeneration = mutation({
  args: {
    messageId: v.id("messages"),
    finalText: v.string(),
    isError: v.optional(v.boolean()),
    errorMessage: v.optional(v.string()),
    searchMeta: v.optional(v.any()),
    reasoning: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);

    const patch: Record<string, any> = {
      parts: [args.finalText],
      isGenerating: false,
    };
    if (args.isError) {
      patch.isError = true;
    }
    if (args.errorMessage) {
      patch.errorMessage = args.errorMessage;
    }
    if (args.searchMeta) {
      patch.searchMeta = args.searchMeta;
    }
    if (args.reasoning) {
      patch.reasoning = args.reasoning;
    }
    await ctx.db.patch(args.messageId, patch);

    // Clear thread-level generating flag
    if (message) {
      await ctx.db.patch(message.threadId, { isGenerating: false });
    }
  },
});

export const getMessages = query({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx).catch(() => null);
    if (!user) return [];

    const normalizedId = ctx.db.normalizeId("threads", args.threadId);
    if (!normalizedId) return [];

    const thread = await ctx.db.get(normalizedId);
    if (!thread || thread.userId !== user._id) return [];

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_threadId", (q) => q.eq("threadId", normalizedId))
      .collect();

    return await Promise.all(
      messages.map(async (msg) => {
        // FAST PATH: Return the EXACT original object if no files.
        // This restores Convex's structural sharing and TanStack's deep memoization.
        if (!msg.fileIds || msg.fileIds.length === 0) {
          return msg;
        }

        // HEAVY PATH: Only map metadata for messages that actually have attachments.
        const files = await Promise.all(
          msg.fileIds.map(async (id) => {
            const file = await ctx.db.get(id);
            if (!file) return null;
            return {
              _id: file._id,
              name: file.name,
              mimeType: file.mimeType,
              // STRIPPED: No signed URLs here! Generating URLs with timestamps
              // inside a query breaks determinism and destroys the cache.
            };
          })
        );
        return { ...msg, files: files.filter(Boolean) };
      })
    );
  },
});
