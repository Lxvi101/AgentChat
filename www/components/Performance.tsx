import * as React from "react";

/**
 * Performance section, animated bar charts for TTFT and conversation-switch
 * latency. Pure CSS animation; no layout thrash.
 */

interface Bar {
  label: string;
  ms: number;
  highlight?: boolean;
}

/** Cross-product spot check, Kimi K2 Instant where available (see /site/ttft). */
const TTFT_DATA: Bar[] = [
  { label: "AgentChat (Kimi K2 Instant)", ms: 1400, highlight: true },
  { label: "Gemini (fast, non-reasoning)", ms: 1710 },
  { label: "ChatGPT (Instant)", ms: 2450 },
  { label: "T3Chat (Kimi K2 Instant)", ms: 3500 },
];

/** Median ms from sidebar click until the new thread is interactive. */
const CHAT_SWITCH_DATA: Bar[] = [
  { label: "t3.chat", ms: 30 },
  { label: "AgentChat", ms: 40, highlight: true },
  { label: "claude.com", ms: 600 },
  { label: "chatgpt.com", ms: 1400 },
];

const TTFT_MAX = Math.max(...TTFT_DATA.map((d) => d.ms));
const SWITCH_MAX = Math.max(...CHAT_SWITCH_DATA.map((d) => d.ms));

export const Performance: React.FC = () => {
  const ref = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  return (
    <section id="performance" className="site-perf" ref={ref}>
      <div className="site-section__lead">
        <div className="site-section__tag">/ performance</div>
        <h2 className="site-section__title">
          Time to first token, measured <em>honestly</em>.
        </h2>
        <p className="site-section__sub">
          Informal browser spot check: same anti-cache prompt, fast
          (non&ndash;reasoning) model per app, median time to first token.{" "}
          <a className="site-perf__method-link" href="/site/ttft">
            How we tested (heuristic, not a lab benchmark)
          </a>
        </p>
      </div>

      <div className="site-perf__chart" data-visible={visible ? "true" : "false"}>
        {TTFT_DATA.map((d) => {
          const width = visible ? (d.ms / TTFT_MAX) * 100 : 0;
          return (
            <div
              className={
                "site-perf__row" +
                (d.highlight ? " site-perf__row--us" : "")
              }
              key={d.label}
            >
              <div className="site-perf__label">{d.label}</div>
              <div className="site-perf__track">
                <div
                  className="site-perf__fill"
                  style={{ width: `${width}%` }}
                />
              </div>
              <div className="site-perf__value">{d.ms}ms</div>
            </div>
          );
        })}
      </div>

      <p className="site-perf__footnote">
        Approximate in-browser times (April 2026). Measured with devtools /
        performance recording; not peer-reviewed. Does not include our own
        server-side &ldquo;warm&rdquo; app optimization claims, see the write-up
        for the exact prompt and limits.
      </p>

      <div className="site-perf__panel">
        <div className="site-section__lead">
          <div className="site-section__tag">/ thread switching</div>
          <h2 className="site-section__title">
            Switch chats in <em>milliseconds</em>, not seconds.
          </h2>
          <p className="site-section__sub">
            Median time from choosing another conversation until the composer
            is ready again. Desktop Chrome, comparable network.
          </p>
        </div>

        <div className="site-perf__chart" data-visible={visible ? "true" : "false"}>
          {CHAT_SWITCH_DATA.map((d) => {
            const width = visible ? (d.ms / SWITCH_MAX) * 100 : 0;
            return (
              <div
                className={
                  "site-perf__row" +
                  (d.highlight ? " site-perf__row--us" : "")
                }
                key={d.label}
              >
                <div className="site-perf__label">{d.label}</div>
                <div className="site-perf__track">
                  <div
                    className="site-perf__fill"
                    style={{ width: `${width}%` }}
                  />
                </div>
                <div className="site-perf__value">{d.ms}ms</div>
              </div>
            );
          })}
        </div>

        <p className="site-perf__footnote">
          Competitor figures measured on their web apps in April&nbsp;2026;
          methodology matches the subtitle above.
        </p>
      </div>
    </section>
  );
};
