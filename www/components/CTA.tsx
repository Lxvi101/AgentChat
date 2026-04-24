import * as React from "react";

export interface CTAProps {
  onLaunch: () => void;
}

export const CTA: React.FC<CTAProps> = ({ onLaunch }) => (
  <section className="site-final-cta">
    <div className="site-final-cta__inner">
      <h2 className="site-final-cta__title">
        Stop waiting on tokens.
      </h2>
      <p className="site-final-cta__sub">
        Open the app and feel the difference.
      </p>
      <div className="site-final-cta__row">
        <button
          type="button"
          className="site-cta site-cta--primary site-cta--large"
          onClick={onLaunch}
        >
          Launch AgentChat
          <svg
            width="16"
            height="16"
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
      </div>
    </div>
  </section>
);
