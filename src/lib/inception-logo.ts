import type { CSSProperties } from "react";

/** Public URL for the Inception Labs mark (`public/logos/inception.svg`). */
export const INCEPTION_LOGO_SRC = "/logos/inception.svg";

/** Inline style fragment: mask the asset so `bg-current` tracks `color` (hover/selected like other provider icons). */
export const inceptionLogoMaskStyle: CSSProperties = {
  maskImage: `url("${INCEPTION_LOGO_SRC}")`,
  WebkitMaskImage: `url("${INCEPTION_LOGO_SRC}")`,
  maskSize: "contain",
  WebkitMaskSize: "contain",
  maskRepeat: "no-repeat",
  WebkitMaskRepeat: "no-repeat",
  maskPosition: "center",
  WebkitMaskPosition: "center",
};
