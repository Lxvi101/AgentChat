import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { authComponent } from "./auth";

export const get = query({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx).catch(() => null);
    if (!user) return null;

    // Gracefully handle malformed URL IDs instead of throwing an error
    const normalizedId = ctx.db.normalizeId("threads", args.threadId);
    if (!normalizedId) return null;

    const thread = await ctx.db.get(normalizedId);
    if (!thread || thread.userId !== user._id) return null;

    return thread;
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx).catch(() => null);
    if (!user) return [];

    // 2. Fetch their threads (newest first)
    const threads = await ctx.db
      .query("threads")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(50); // Keep it snappy, load last 50

    return threads;
  },
});

export const togglePin = mutation({
  args: {
    threadId: v.id("threads"),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Unauthorized");

    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.userId !== user._id) {
      throw new Error("Thread not found");
    }

    await ctx.db.patch(args.threadId, {
      isPinned: !thread.isPinned,
    });
  },
});

export const deleteAll = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Unauthorized");

    const threads = await ctx.db
      .query("threads")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    for (const thread of threads) {
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_threadId", (q) => q.eq("threadId", thread._id))
        .collect();

      for (const message of messages) {
        await ctx.db.delete(message._id);
      }

      await ctx.db.delete(thread._id);
    }
  },
});

export const create = mutation({
  args: {
    agentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Unauthorized");

    // Create a new empty thread
    const threadId = await ctx.db.insert("threads", {
      userId: user._id,
      agentId: args.agentId,
      isEphemeral: false,
    });

    return threadId;
  },
});

export const getThreadContext = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread || !thread.agentId) return null;

    const agent = await ctx.db.get(thread.agentId);
    return agent;
  },
});

export const setTitle = mutation({
  args: {
    threadId: v.id("threads"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) throw new Error("Thread not found");

    await ctx.db.patch(args.threadId, { title: args.title });
  },
});

export const archiveMany = mutation({
  args: { threadIds: v.array(v.id("threads")) },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Unauthorized");

    for (const threadId of args.threadIds) {
      const thread = await ctx.db.get(threadId);
      if (thread && thread.userId === user._id) {
        await ctx.db.patch(threadId, { isArchived: true });
      }
    }
  },
});

export const unarchiveMany = mutation({
  args: { threadIds: v.array(v.id("threads")) },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Unauthorized");

    for (const threadId of args.threadIds) {
      const thread = await ctx.db.get(threadId);
      if (thread && thread.userId === user._id) {
        await ctx.db.patch(threadId, { isArchived: false });
      }
    }
  },
});

export const deleteMany = mutation({
  args: { threadIds: v.array(v.id("threads")) },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Unauthorized");

    for (const threadId of args.threadIds) {
      const thread = await ctx.db.get(threadId);
      if (!thread || thread.userId !== user._id) continue;

      const messages = await ctx.db
        .query("messages")
        .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
        .collect();

      for (const message of messages) {
        await ctx.db.delete(message._id);
      }

      await ctx.db.delete(threadId);
    }
  },
});

export const listArchived = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx).catch(() => null);
    if (!user) return [];

    // Index-backed: only reads archived threads for this user, no full scan.
    const threads = await ctx.db
      .query("threads")
      .withIndex("by_userId_and_isArchived", (q) =>
        q.eq("userId", user._id).eq("isArchived", true),
      )
      .order("desc")
      .take(200);

    return threads;
  },
});

export const listShared = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx).catch(() => null);
    if (!user) return [];

    // Index-backed: only reads shared threads for this user, no full scan.
    const threads = await ctx.db
      .query("threads")
      .withIndex("by_userId_and_isShared", (q) =>
        q.eq("userId", user._id).eq("isShared", true),
      )
      .order("desc")
      .take(200);

    return threads;
  },
});

export const branch = mutation({
  args: {
    originalThreadId: v.id("threads"),
    cutoffMessageIndex: v.number(), // Clone messages up to (but NOT including) this index
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Unauthorized");

    const thread = await ctx.db.get(args.originalThreadId);
    if (!thread || thread.userId !== user._id) {
      throw new Error("Thread not found");
    }

    // Create new thread copying agent and title
    const newThreadId = await ctx.db.insert("threads", {
      userId: user._id,
      agentId: thread.agentId,
      isEphemeral: false,
      title: thread.title ? `${thread.title} (branch)` : undefined,
      isPinned: false,
    });

    // Fetch all messages from original thread in order
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.originalThreadId))
      .collect();

    // Clone messages up to the cutoff index
    const toClone = messages.slice(0, args.cutoffMessageIndex);
    for (const msg of toClone) {
      await ctx.db.insert("messages", {
        threadId: newThreadId,
        role: msg.role,
        parts: msg.parts,
        fileIds: msg.fileIds,
        model: msg.model,
        isGenerating: false,
      });
    }

    return newThreadId;
  },
});

export const remove = mutation({
  args: {
    threadId: v.id("threads"),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Unauthorized");

    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.userId !== user._id) {
      throw new Error("Thread not found");
    }

    // Delete all messages belonging to this thread first
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .collect();

    for (const message of messages) {
      await ctx.db.delete(message._id);
    }

    // Delete the thread itself
    await ctx.db.delete(args.threadId);
  },
});
