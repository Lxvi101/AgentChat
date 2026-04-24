export interface ReferenceConfig {
  /** The fal.ai endpoint to call when reference images are provided */
  editEndpoint: string;
  /** Maximum number of reference images the model accepts */
  maxReferences: number;
  /** The fal.ai input key for the reference image URLs (typically "image_urls") */
  inputKey: string;
}

/**
 * How this model handles image sizing. Each fal endpoint has its own API shape:
 *
 * - `"custom_dimensions"`, accepts `image_size: { width, height }` (Flux, Seedream)
 * - `"aspect_only"`, accepts `aspect_ratio` enum, no resolution control (Nano Banana v1)
 * - `"aspect_resolution"`, accepts `aspect_ratio` + a `resolution` enum tier (Nano Banana 2/Pro)
 * - `"preset_quality"`, accepts preset `image_size` strings + `quality` enum (GPT Image 1)
 */
export type SizeMode =
  | "custom_dimensions"
  | "aspect_only"
  | "aspect_resolution"
  | "preset_quality";

export interface ImageModelConfig {
  id: string;
  falEndpoint: string;
  name: string;
  description: string;
  costPerImage: number;
  maxResolution: number;
  supportsNegativePrompt: boolean;
  /** Whether the model supports reference/image-to-image input */
  supportsReferences: boolean;
  /** Configuration for reference image handling (when supportsReferences is true) */
  referenceConfig?: ReferenceConfig;
  /** How this model handles sizing, determines what fal params are sent */
  sizeMode: SizeMode;
  /** Maps our Resolution enum → model-specific resolution tier (for "aspect_resolution" mode) */
  resolutionMap?: Record<Resolution, string>;
  /** Maps our Resolution enum → quality tier (for "preset_quality" mode) */
  qualityMap?: Record<Resolution, string>;
}

export const IMAGE_MODELS: ImageModelConfig[] = [
  {
    id: "nano-banana",
    falEndpoint: "fal-ai/nano-banana",
    name: "Nano Banana",
    description: "Lightweight, fast generation",
    costPerImage: 0.003,
    maxResolution: 1024,
    supportsNegativePrompt: true,
    supportsReferences: true,
    referenceConfig: {
      editEndpoint: "fal-ai/nano-banana/edit",
      maxReferences: 4,
      inputKey: "image_urls",
    },
    sizeMode: "aspect_only",
  },
  {
    id: "nano-banana-2",
    falEndpoint: "fal-ai/nano-banana-2",
    name: "Nano Banana 2",
    description: "Latest nano banana with balanced speed and quality",
    costPerImage: 0.005,
    maxResolution: 1024,
    supportsNegativePrompt: true,
    supportsReferences: true,
    referenceConfig: {
      editEndpoint: "fal-ai/nano-banana-2/edit",
      maxReferences: 4,
      inputKey: "image_urls",
    },
    sizeMode: "aspect_resolution",
    resolutionMap: { standard: "0.5K", high: "1K", ultra: "2K" },
  },
  {
    id: "nano-banana-pro",
    falEndpoint: "fal-ai/nano-banana-pro",
    name: "Nano Banana Pro",
    description: "Fast, high-quality generation",
    costPerImage: 0.008,
    maxResolution: 1536,
    supportsNegativePrompt: true,
    supportsReferences: true,
    referenceConfig: {
      editEndpoint: "fal-ai/nano-banana-pro/edit",
      maxReferences: 4,
      inputKey: "image_urls",
    },
    sizeMode: "aspect_resolution",
    resolutionMap: { standard: "1K", high: "2K", ultra: "4K" },
  },
  {
    id: "seedream-v4.5",
    falEndpoint: "fal-ai/bytedance/seedream/v4.5/text-to-image",
    name: "Seedream v4.5",
    description: "High-quality generation from ByteDance",
    costPerImage: 0.025,
    maxResolution: 2048,
    supportsNegativePrompt: true,
    supportsReferences: false,
    sizeMode: "custom_dimensions",
  },
  {
    id: "flux-2-flex",
    falEndpoint: "fal-ai/flux-2-flex",
    name: "Flux 2 Flex",
    description: "Flexible creative generation with image references",
    costPerImage: 0.025,
    maxResolution: 1536,
    supportsNegativePrompt: false,
    supportsReferences: true,
    referenceConfig: {
      editEndpoint: "fal-ai/flux-2-flex/edit",
      maxReferences: 4,
      inputKey: "image_urls",
    },
    sizeMode: "custom_dimensions",
  },
  {
    id: "gpt-image-2-2026-04-21",
    falEndpoint: "fal-ai/gpt-image-1",
    name: "GPT Image 2 (2026-04-21)",
    description: "OpenAI-style image generation with editing support",
    costPerImage: 0.04,
    maxResolution: 2048,
    supportsNegativePrompt: false,
    supportsReferences: true,
    referenceConfig: {
      editEndpoint: "fal-ai/gpt-image-1/edit-image",
      maxReferences: 4,
      inputKey: "image_urls",
    },
    sizeMode: "preset_quality",
    qualityMap: { standard: "low", high: "medium", ultra: "high" },
  },
];

export type AspectRatio = "1:1" | "9:16" | "4:5" | "3:4" | "5:4" | "2:1";
export type Resolution = "standard" | "high" | "ultra";

export const ASPECT_RATIOS: {
  id: AspectRatio;
  label: string;
  width: number;
  height: number;
}[] = [
  { id: "1:1", label: "1:1", width: 1, height: 1 },
  { id: "9:16", label: "9:16", width: 9, height: 16 },
  { id: "4:5", label: "4:5", width: 4, height: 5 },
  { id: "3:4", label: "3:4", width: 3, height: 4 },
  { id: "5:4", label: "5:4", width: 5, height: 4 },
  { id: "2:1", label: "2:1", width: 2, height: 1 },
];

export const RESOLUTIONS: {
  id: Resolution;
  label: string;
  description: string;
}[] = [
  { id: "standard", label: "Standard", description: "~512px" },
  { id: "high", label: "High", description: "~1024px" },
  { id: "ultra", label: "Ultra", description: "~1536px" },
];

/**
 * Calculate pixel dimensions for a given aspect ratio and resolution,
 * clamped to the model's maximum resolution. Dimensions are rounded
 * to the nearest multiple of 64 for best model compatibility.
 */
export function getImageDimensions(
  aspectRatio: AspectRatio,
  resolution: Resolution,
  maxResolution: number = 2048,
): { width: number; height: number } {
  const ratio =
    ASPECT_RATIOS.find((r) => r.id === aspectRatio) ?? ASPECT_RATIOS[0];

  const baseSize =
    resolution === "standard" ? 512 : resolution === "high" ? 1024 : 1536;
  const clampedBase = Math.min(baseSize, maxResolution);

  let width: number;
  let height: number;

  if (ratio.width >= ratio.height) {
    width = clampedBase;
    height = Math.round((clampedBase * ratio.height) / ratio.width);
  } else {
    height = clampedBase;
    width = Math.round((clampedBase * ratio.width) / ratio.height);
  }

  // Round to nearest 64 for best model compatibility
  width = Math.round(width / 64) * 64;
  height = Math.round(height / 64) * 64;

  // Ensure within max resolution
  width = Math.min(width, maxResolution);
  height = Math.min(height, maxResolution);

  return { width, height };
}

// ─── Aspect-ratio mapping for models that use fal's aspect_ratio enum ───────
// Our app supports "2:1" which isn't in every model's enum; map to nearest.
const FAL_ASPECT_MAP: Record<AspectRatio, string> = {
  "1:1": "1:1",
  "9:16": "9:16",
  "4:5": "4:5",
  "3:4": "3:4",
  "5:4": "5:4",
  "2:1": "16:9", // Closest standard ratio supported by all models
};

// GPT Image 1 only accepts these preset sizes
const GPT_PRESET_MAP: Record<AspectRatio, string> = {
  "1:1": "1024x1024",
  "9:16": "1024x1536",
  "4:5": "1024x1536",
  "3:4": "1024x1536",
  "5:4": "1536x1024",
  "2:1": "1536x1024",
};

/**
 * Build the size-related parameters for a fal.ai call, respecting each
 * model's API shape. Returns a partial input object to spread into `falInput`.
 */
export function buildFalSizeInput(
  model: ImageModelConfig,
  aspectRatio: AspectRatio,
  resolution: Resolution,
): Record<string, any> {
  switch (model.sizeMode) {
    case "custom_dimensions": {
      const dims = getImageDimensions(aspectRatio, resolution, model.maxResolution);
      return { image_size: dims };
    }
    case "aspect_only": {
      return { aspect_ratio: FAL_ASPECT_MAP[aspectRatio] };
    }
    case "aspect_resolution": {
      return {
        aspect_ratio: FAL_ASPECT_MAP[aspectRatio],
        resolution: model.resolutionMap![resolution],
      };
    }
    case "preset_quality": {
      return {
        image_size: GPT_PRESET_MAP[aspectRatio],
        quality: model.qualityMap![resolution],
      };
    }
  }
}

/**
 * Returns a short description of what the current resolution actually means
 * for the selected model, plus a tooltip explanation.
 */
export function getResolutionInfo(
  model: ImageModelConfig,
  resolution: Resolution,
): { description: string; tooltip: string } {
  switch (model.sizeMode) {
    case "custom_dimensions": {
      const desc =
        resolution === "standard" ? "~512px" : resolution === "high" ? "~1024px" : "~1536px";
      return {
        description: desc,
        tooltip: "Controls the pixel dimensions of the generated image",
      };
    }
    case "aspect_only":
      return {
        description: "Model default",
        tooltip:
          "This model generates at a fixed resolution, only the aspect ratio affects the output shape",
      };
    case "aspect_resolution":
      return {
        description: model.resolutionMap![resolution],
        tooltip:
          "Controls the output resolution tier. Higher tiers produce sharper, more detailed images",
      };
    case "preset_quality": {
      const q = model.qualityMap![resolution];
      return {
        description: `${q.charAt(0).toUpperCase() + q.slice(1)} quality`,
        tooltip:
          "Controls generation quality and detail level. Higher quality takes longer and costs more",
      };
    }
  }
}

/** Estimate cost based on resolution multiplier */
export function estimateCost(
  model: ImageModelConfig,
  resolution: Resolution,
): number {
  const multiplier =
    resolution === "standard" ? 1 : resolution === "high" ? 1.5 : 2.5;
  return Math.round(model.costPerImage * multiplier * 1000) / 1000;
}

export function getImageModelConfig(
  modelId: string,
): ImageModelConfig | undefined {
  return IMAGE_MODELS.find((m) => m.id === modelId);
}
