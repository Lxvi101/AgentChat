// Lab marks for the marketing site: rasterized SVG assets in `/public/logos`
// where available; minimal inline glyphs only when no asset exists.
import * as React from "react";

import { INCEPTION_LOGO_SRC } from "~/lib/inception-logo";
import { XIAOMI_LOGO_SRC } from "~/lib/xiaomi-logo";

type IconProps = React.SVGProps<SVGSVGElement> & { title?: string };

const BaseIcon: React.FC<IconProps & { children: React.ReactNode }> = ({
  children,
  title,
  ...rest
}) => (
  <svg
    viewBox="0 0 48 48"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden={title ? undefined : true}
    role={title ? "img" : "presentation"}
    {...rest}
  >
    {title && <title>{title}</title>}
    {children}
  </svg>
);

const MoonshotMark: React.FC<IconProps> = (p) => (
  <BaseIcon title="Moonshot Kimi" {...p}>
    <path d="M32 4a20 20 0 1 0 12 36A16 16 0 0 1 32 4Z" />
  </BaseIcon>
);

const ZAIMark: React.FC<IconProps> = (p) => (
  <BaseIcon title="Z.ai GLM" {...p}>
    <path d="M6 8h36l-27 28h27v4H6l27-28H6V8Z" />
  </BaseIcon>
);

const MiniMaxMark: React.FC<IconProps> = (p) => (
  <BaseIcon title="MiniMax" {...p}>
    <path d="M4 40V8h5l8 20 8-20h5v32h-4V16l-9 24h-2l-9-24v24H4Zm36-32h4v32h-4V8Z" />
  </BaseIcon>
);

/**
 * Keys for SVGs that are black / near-black / `currentColor` / stroke-black.
 * As `<img>` on `#000` they need `invert(1)` only, see `.site-lab-logo--on-dark`.
 */
const LAB_LOGO_INVERT_ON_DARK = new Set([
  "anthropic",
  "openai",
  "xai",
  "openrouter",
  "qwen",
  "midjourney",
  "inception",
]);

/** Logos served from `public/logos/` (shown in the marquee). */
export const SITE_LAB_ASSETS = [
  { key: "anthropic", label: "Anthropic", src: "/logos/anthropic_black.svg" },
  { key: "openai", label: "OpenAI", src: "/logos/openai.svg" },
  { key: "google", label: "Google Gemini", src: "/logos/gemini.svg" },
  { key: "xai", label: "xAI", src: "/logos/xai_light.svg" },
  { key: "deepseek", label: "DeepSeek", src: "/logos/deepseek.svg" },
  { key: "meta", label: "Meta", src: "/logos/meta.svg" },
  { key: "mistral", label: "Mistral", src: "/logos/mistral-ai_logo.svg" },
  { key: "openrouter", label: "OpenRouter", src: "/logos/openrouter_light.svg" },
  { key: "qwen", label: "Qwen", src: "/logos/qwen_light.svg" },
  { key: "midjourney", label: "Midjourney", src: "/logos/midjourney.svg" },
  { key: "cerebras", label: "Cerebras", src: "/logos/cerebras.svg" },
  { key: "nvidia", label: "NVIDIA", src: "/logos/nvidia-icon-light.svg" },
  { key: "xiaomi", label: "Xiaomi", src: XIAOMI_LOGO_SRC },
] as const;

export type SiteLabAsset = (typeof SITE_LAB_ASSETS)[number];

export type ModelLabEntry =
  | {
      key: string;
      label: string;
      src: string;
      Icon?: undefined;
    }
  | {
      key: string;
      label: string;
      src: null;
      Icon: React.FC<IconProps>;
    };

/** Labs referenced in the models table (image or inline fallback). */
export const MODEL_LAB_ENTRIES: readonly ModelLabEntry[] = [
  { key: "anthropic", label: "Anthropic", src: "/logos/anthropic_black.svg" },
  { key: "openai", label: "OpenAI", src: "/logos/openai.svg" },
  { key: "google", label: "Google DeepMind", src: "/logos/gemini.svg" },
  { key: "xai", label: "xAI", src: "/logos/xai_light.svg" },
  { key: "deepseek", label: "DeepSeek", src: "/logos/deepseek.svg" },
  { key: "meta", label: "Meta AI", src: "/logos/meta.svg" },
  {
    key: "moonshot",
    label: "Moonshot",
    src: null,
    Icon: MoonshotMark,
  },
  {
    key: "zai",
    label: "Z.ai",
    src: null,
    Icon: ZAIMark,
  },
  {
    key: "minimax",
    label: "MiniMax",
    src: null,
    Icon: MiniMaxMark,
  },
  {
    key: "inception",
    label: "Inception Labs",
    src: INCEPTION_LOGO_SRC,
  },
  { key: "xiaomi", label: "Xiaomi", src: XIAOMI_LOGO_SRC },
] as const;

export const LabMark: React.FC<{
  lab: ModelLabEntry | SiteLabAsset;
  width: number;
  height: number;
  className?: string;
}> = ({ lab, width, height, className }) => {
  if ("src" in lab && lab.src) {
    const invert = LAB_LOGO_INVERT_ON_DARK.has(lab.key);
    return (
      <img
        src={lab.src}
        alt=""
        width={width}
        height={height}
        className={
          "site-lab-logo" +
          (invert ? " site-lab-logo--on-dark" : "") +
          (className ? ` ${className}` : "")
        }
        draggable={false}
      />
    );
  }
  const Icon = "Icon" in lab ? lab.Icon : undefined;
  if (!Icon) return null;
  return <Icon width={width} height={height} className={className} />;
};
