import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.subject))
      .unique();
    if (!user) return [];

    return await ctx.db
      .query("imageGenerations")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(100);
  },
});

export const create = mutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");

    return await ctx.db.insert("imageGenerations", {
      userId: user._id,
      ...args,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("imageGenerations") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");

    const gen = await ctx.db.get(args.id);
    if (!gen) throw new Error("Not found");
    if (gen.userId !== user._id) throw new Error("Forbidden");

    await ctx.db.delete(args.id);
  },
});
