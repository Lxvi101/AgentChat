import { createFileRoute } from "@tanstack/react-router";
import { fal } from "@fal-ai/client";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { getToken } from "~/lib/auth-server";
import {
  getImageModelConfig,
  getImageDimensions,
  buildFalSizeInput,
  type AspectRatio,
  type Resolution,
} from "~/lib/image-models";

// Configure fal.ai at module level (runs once)
fal.config({
  credentials: process.env.FAL_KEY ?? "",
});

const convex = new ConvexHttpClient(process.env.VITE_CONVEX_URL!);

export const Route = createFileRoute("/api/image/generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = await getToken();
        if (!token) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        if (!process.env.FAL_KEY) {
          return Response.json(
            { error: "FAL_KEY not configured on server" },
            { status: 500 }
          );
        }

        try {
          const body = await request.json();
          const {
            prompt,
            modelId,
            aspectRatio,
            resolution,
            referenceFileIds,
          } = body as {
            prompt: string;
            modelId: string;
            aspectRatio: AspectRatio;
            resolution: Resolution;
            referenceFileIds?: string[];
          };

          if (!prompt?.trim()) {
            return Response.json(
              { error: "Prompt is required" },
              { status: 400 }
            );
          }

          const model = getImageModelConfig(modelId);
          if (!model) {
            return Response.json(
              { error: `Unknown model: ${modelId}` },
              { status: 400 }
            );
          }

          const dimensions = getImageDimensions(
            aspectRatio,
            resolution,
            model.maxResolution
          );

          // Resolve reference image URLs from Convex storage
          let resolvedReferenceUrls: string[] = [];
          if (
            referenceFileIds?.length &&
            model.supportsReferences &&
            model.referenceConfig
          ) {
            convex.setAuth(token);
            const files = await convex.query(api.files.getFileUrls, {
              fileIds: referenceFileIds as any,
            });
            resolvedReferenceUrls = files
              .filter((f: any) => f?.url)
              .map((f: any) => f.url as string);
          }

          const hasReferences =
            resolvedReferenceUrls.length > 0 &&
            model.supportsReferences &&
            model.referenceConfig;

          // Build fal.ai input, size params vary per model and mode
          const sizeParams = buildFalSizeInput(model, aspectRatio, resolution);

          const falInput: Record<string, any> = {
            prompt: prompt.trim(),
            num_images: 1,
            enable_safety_checker: true,
            ...sizeParams,
          };

          if (hasReferences) {
            // Edit mode: attach reference image URLs as an array
            const { inputKey, maxReferences } = model.referenceConfig!;
            falInput[inputKey] = resolvedReferenceUrls.slice(0, maxReferences);
          }

          // Pick endpoint: use the dedicated edit endpoint when references
          // are present, otherwise the standard text-to-image endpoint
          const endpoint = hasReferences
            ? model.referenceConfig!.editEndpoint
            : model.falEndpoint;

          const startTime = Date.now();

          // Call fal.ai, subscribe waits for the queue to complete
          const result = await fal.subscribe(endpoint, {
            input: falInput,
          });

          const generationTime = (Date.now() - startTime) / 1000;
          const data = result.data as Record<string, any>;
          const image = data?.images?.[0];

          if (!image?.url) {
            return Response.json(
              { error: "No image generated, model returned empty result" },
              { status: 500 }
            );
          }

          // Estimate cost
          const costMultiplier =
            resolution === "standard"
              ? 1
              : resolution === "high"
                ? 1.5
                : 2.5;
          const cost =
            Math.round(model.costPerImage * costMultiplier * 1000) / 1000;

          // Persist to Convex
          convex.setAuth(token);
          const generationId = await convex.mutation(
            api.imageGenerations.create,
            {
              prompt: prompt.trim(),
              modelId,
              modelName: model.name,
              aspectRatio,
              resolution,
              imageUrl: image.url,
              width: image.width ?? dimensions.width,
              height: image.height ?? dimensions.height,
              generationTime: Math.round(generationTime * 10) / 10,
              cost,
              seed: data?.seed ?? undefined,
              referenceImageUrls:
                resolvedReferenceUrls.length > 0
                  ? resolvedReferenceUrls
                  : undefined,
            }
          );

          return Response.json({
            id: generationId,
            imageUrl: image.url,
            width: image.width ?? dimensions.width,
            height: image.height ?? dimensions.height,
            generationTime: Math.round(generationTime * 10) / 10,
            cost,
            seed: data?.seed,
          });
        } catch (error: any) {
          console.error("[image/generate] Error:", error);
          return Response.json(
            { error: error?.message ?? "Image generation failed" },
            { status: 500 }
          );
        }
      },
    },
  },
});
