import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { authComponent } from "./auth";
import { components } from "./_generated/api";

// Helper to strictly enforce admin rights
async function requireAdmin(ctx: any) {
  const user = await authComponent.getAuthUser(ctx);
  if (!user) throw new Error("Unauthorized");

  const dbUser = await ctx.db
    .query("users")
    .withIndex("by_authId", (q: any) => q.eq("authId", user._id))
    .unique();

  if (dbUser?.role !== "admin") {
    throw new Error("Forbidden: Administrators only");
  }
  return dbUser;
}

export const getSettings = query({
  handler: async (ctx) => {
    const locked = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", "signupsLocked"))
      .unique();
    return {
      signupsLocked: locked?.value === true,
    };
  }
});

export const toggleSignupLock = mutation({
  args: { locked: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const setting = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", "signupsLocked"))
      .unique();

    if (setting) {
      await ctx.db.patch(setting._id, { value: args.locked });
    } else {
      await ctx.db.insert("appSettings", { key: "signupsLocked", value: args.locked });
    }
  }
});

// Used to grant the very first user administrative privileges
export const bootstrapAdmin = mutation({
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) return false;

    const existingAdmins = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "admin"))
      .collect();

    if (existingAdmins.length === 0) {
      const dbUser = await ctx.db
        .query("users")
        .withIndex("by_authId", (q) => q.eq("authId", user._id))
        .unique();

      if (dbUser) {
        await ctx.db.patch(dbUser._id, { role: "admin" });

        // Must also patch the Better Auth component user database
        try {
          await ctx.runMutation(components.betterAuth.adapter.updateOne as any, {
            input: {
              model: "user",
              where: [{ field: "_id", value: user._id, operator: "eq" }],
              update: { role: "admin" }
            }
          });
        } catch(e) {
          console.warn("Failed to patch internal auth user role.", e);
        }
        return true;
      }
    }
    return false;
  }
});

export const getAllUsers = query({
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db.query("users").order("desc").collect();
  }
});
