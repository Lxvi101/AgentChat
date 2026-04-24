import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { authComponent } from "./auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx).catch(() => null);
    if (!user) return [];

    return await ctx.db
      .query("agents")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    emoji: v.optional(v.string()),
    systemPrompt: v.optional(v.string()),
    includedFiles: v.optional(v.array(v.id("files"))),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Unauthorized");

    return await ctx.db.insert("agents", {
      userId: user._id,
      name: args.name,
      emoji: args.emoji,
      systemPrompt: args.systemPrompt,
      includedFiles: args.includedFiles,
    });
  },
});

export const update = mutation({
  args: {
    agentId: v.id("agents"),
    name: v.string(),
    emoji: v.optional(v.string()),
    systemPrompt: v.optional(v.string()),
    includedFiles: v.optional(v.array(v.id("files"))),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Unauthorized");

    const agent = await ctx.db.get(args.agentId);
    if (!agent || agent.userId !== user._id) throw new Error("Agent not found");

    const patch: {
      name: string;
      emoji?: string;
      systemPrompt?: string;
      includedFiles?: typeof args.includedFiles;
    } = {
      name: args.name,
    };
    if (args.emoji !== undefined) patch.emoji = args.emoji;
    if (args.systemPrompt !== undefined) patch.systemPrompt = args.systemPrompt;
    if (args.includedFiles !== undefined) patch.includedFiles = args.includedFiles;
    await ctx.db.patch(args.agentId, patch);
  },
});

export const remove = mutation({
  args: {
    agentId: v.id("agents"),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Unauthorized");

    const agent = await ctx.db.get(args.agentId);
    if (!agent || agent.userId !== user._id) throw new Error("Agent not found");

    // Untie threads from this agent so they aren't orphaned/deleted
    const threads = await ctx.db
      .query("threads")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    for (const thread of threads) {
      if (thread.agentId === args.agentId) {
        await ctx.db.patch(thread._id, { agentId: undefined });
      }
    }

    // Delete the agent
    await ctx.db.delete(args.agentId);
  },
});
