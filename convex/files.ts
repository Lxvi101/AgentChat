import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { authComponent } from "./auth";

// 1. Generate an upload URL for the client to push files to
export const generateUploadUrl = mutation(async (ctx) => {
  const user = await authComponent.getAuthUser(ctx);
  if (!user) throw new Error("Unauthorized");
  return await ctx.storage.generateUploadUrl();
});

// 2. Save the metadata after the client uploads the file
export const saveMetadata = mutation({
  args: {
    storageId: v.id("_storage"),
    name: v.string(),
    mimeType: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Unauthorized");

    return await ctx.db.insert("files", {
      userId: user._id,
      storageId: args.storageId,
      name: args.name,
      mimeType: args.mimeType,
    });
  },
});

// 3. Get file URLs for the API route to fetch text/images
export const getFileUrls = query({
  args: { fileIds: v.array(v.id("files")) },
  handler: async (ctx, args) => {
    const files = await Promise.all(
      args.fileIds.map((id) => ctx.db.get(id))
    );

    return Promise.all(
      files.filter(Boolean).map(async (f) => ({
        ...f,
        url: await ctx.storage.getUrl(f!.storageId),
      }))
    );
  },
});
