/** Full-color StepFun wordmark + icon (`public/logos/stepfun.svg`). */
export const STEPFUN_LOGO_SRC = "/logos/stepfun.svg";

/**
 * ViewBox for the icon-only provider mark (a circle with five rectangular
 * "windows" cut out, the StepFun symbol without the wordmark).
 */
export const STEPFUN_ICON_VIEWBOX = "0 0 28 28";

/**
 * Icon path extracted from `stepfun.svg`. Combines the outer circle with the
 * five rectangular cutouts in a single `<path>`; render with
 * `fill-rule="evenodd"` so the rectangles punch holes through the disc.
 * In-app icons use this with `fill="currentColor"` so muted / hover /
 * selection states match other providers.
 */
export const STEPFUN_ICON_PATH_D =
  "M14 0C6.272 0 0 6.272 0 14C0 21.728 6.272 28 14 28C21.728 28 28 21.728 28 14C28 6.272 21.728 0 14 0ZM10.22 22.876H5.11V17.766H10.22V22.876ZM16.548 22.876H11.438V17.766H16.548V22.876ZM16.548 16.562H11.438V11.438H16.548V16.562ZM16.548 10.234H11.438V5.124H16.548V10.234ZM22.876 10.234H17.766V5.11H22.876V10.234Z";
