import { betterAuth } from 'better-auth/minimal'
import { createClient, type AuthFunctions } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import { admin } from 'better-auth/plugins'
import { createAuthMiddleware } from 'better-auth/api'
import authConfig from './auth.config'
import { api, components, internal } from './_generated/api'
import { query } from './_generated/server'
import type { GenericCtx } from '@convex-dev/better-auth'
import type { DataModel } from './_generated/dataModel'

const siteUrl = process.env.SITE_URL!
const authFunctions: AuthFunctions = internal.auth;

export const authComponent = createClient<DataModel>(components.betterAuth, {
  authFunctions,
  triggers: {
    user: {
      onCreate: async (ctx, doc) => {
        // Sync Better Auth user into our relational schema
        await ctx.db.insert("users", {
          name: doc.name,
          email: doc.email,
          authId: doc._id,
          role: "user", // Default role
        });
      },
      onDelete: async (ctx, doc) => {
        // Clean up our synced relational user when deleted from admin panel
        const dbUser = await ctx.db
          .query("users")
          .withIndex("by_authId", (q) => q.eq("authId", doc._id))
          .unique();
        if (dbUser) {
          await ctx.db.delete(dbUser._id);
        }
      }
    }
  }
})

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth({
    baseURL: siteUrl,
    trustedOrigins: [
      "http://localhost:5173",
      "http://localhost:3000",
      "https://agentch.at",
      "https://www.agentch.at",
      ...(process.env.TRUSTED_ORIGINS?.split(",").map(o => o.trim()).filter(Boolean) ?? []),
    ],
    database: authComponent.adapter(ctx),
    emailAndPassword: { enabled: true, requireEmailVerification: false },
    plugins: [convex({ authConfig }), admin()],
    hooks: {
      before: createAuthMiddleware(async (ctxAuth) => {
        if (ctxAuth.path === "/sign-up/email") {
          const settings = await ctx.runQuery(api.admin.getSettings);
          if (settings?.signupsLocked === true) {
            return new Response(
              JSON.stringify({ message: "Signups are currently locked by the administrator." }),
              { status: 403, headers: { "Content-Type": "application/json" } }
            );
          }
        }
      })
    }
  })
}

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return await authComponent.getAuthUser(ctx).catch(() => null)
  },
})

// Export the trigger API so Convex internals can reach it
export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi()
