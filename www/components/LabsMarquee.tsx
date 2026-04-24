import * as React from "react";
import { LabMark, SITE_LAB_ASSETS } from "./LabIcons";

/**
 * Infinite horizontal marquee of all supported lab logos. Uses a pure
 * CSS translate animation; the reel is doubled so the loop is seamless.
 */
export const LabsMarquee: React.FC = () => {
  const doubled = [...SITE_LAB_ASSETS, ...SITE_LAB_ASSETS];
  return (
    <section className="site-labs" aria-label="Supported AI labs">
      <div className="site-labs__label">supported out of the box</div>
      <div className="site-labs__viewport">
        <div className="site-labs__reel">
          {doubled.map((entry, i) => (
            <div className="site-labs__cell" key={`${entry.key}-${i}`}>
              <LabMark lab={entry} width={28} height={28} />
              <span>{entry.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
