import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { authComponent } from "./auth";

export const getProfile = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx).catch(() => null);
    if (!user) return null;

    const dbUser = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", user._id))
      .unique();

    if (!dbUser) return null;

    return {
      ...dbUser,
      role: dbUser.role || "user",
      // Provide backwards-compatible defaults
      favoriteModels: dbUser.favoriteModels ?? [
        "gemini-3-flash-preview",
        "kimi-k2",
        "openai/gpt-oss-20b"
      ],
      autoFollowStream: dbUser.autoFollowStream ?? true,
    };
  },
});

export const updatePreferences = mutation({
  args: {
    favoriteModels: v.optional(v.array(v.string())),
    autoFollowStream: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Unauthorized");

    const dbUser = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", user._id))
      .unique();

    if (!dbUser) throw new Error("User not found");

    const updates: Record<string, unknown> = {};
    if (args.favoriteModels !== undefined) updates.favoriteModels = args.favoriteModels;
    if (args.autoFollowStream !== undefined) updates.autoFollowStream = args.autoFollowStream;

    await ctx.db.patch(dbUser._id, updates);
  },
});
