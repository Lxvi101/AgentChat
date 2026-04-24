import * as React from "react";
import { LightspeedCanvas } from "./LightspeedCanvas";

/**
 * Hero
 * -----------------------------------------------------------------------------
 * A quiet, full-viewport hero. The lightspeed field breathes in the back-
 * ground; the copy sits in the middle in tight, restrained type. No pills,
 * no stat grids, no competing layers. Think "cold open" rather than "splash
 * page."
 */

export interface HeroProps {
  onLaunch: () => void;
}

export const Hero: React.FC<HeroProps> = ({ onLaunch }) => {
  // Parallax nudge on scroll, a gentle upward drift as the user leaves the
  // hero. No jank: we coalesce to a single rAF per scroll tick.
  const contentRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    let rafId = 0;
    const onScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        const y = Math.min(window.scrollY, 400);
        el.style.transform = `translate3d(0, ${y * -0.22}px, 0)`;
        el.style.opacity = `${Math.max(0, 1 - y / 420)}`;
        rafId = 0;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <section className="site-hero">
      <div className="site-hero__bg">
        <LightspeedCanvas />
        <div className="site-hero__vignette" aria-hidden />
      </div>

      <div className="site-hero__content" ref={contentRef}>
        <h1 className="site-hero__title">
          <span>The world&apos;s fastest</span>
          <span className="site-hero__title-accent">open-source chat hub.</span>
        </h1>

        <p className="site-hero__sub">
          Every frontier model. One streaming runtime.
        </p>

        <div className="site-hero__cta">
          <button
            type="button"
            className="site-cta site-cta--primary"
            onClick={onLaunch}
          >
            Launch the app
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2 7h10M7 2l5 5-5 5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <a
            href="https://github.com/Lxvi101/AgentChat"
            target="_blank"
            rel="noreferrer"
            className="site-cta site-cta--ghost"
          >
            View on GitHub
          </a>
        </div>
      </div>

      <div className="site-hero__scroll-cue" aria-hidden>
        <span>scroll</span>
        <svg width="12" height="18" viewBox="0 0 12 18" fill="none">
          <path
            d="M6 1v16M1 12l5 5 5-5"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </section>
  );
};
