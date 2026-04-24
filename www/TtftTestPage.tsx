import * as React from "react";
import { Nav } from "./components/Nav";
import { Footer } from "./components/Footer";
import { LANDING_SEEN_COOKIE } from "./LandingPage";
import "./styles/landing.css";

/**
 * Shipped under `public/proof/` so Vite serves them as `/proof/...`.
 * Use short ASCII names only, paths with spaces or `@2x` need careful encoding
 * and are easy to break across dev / SSR / static hosts.
 */
const PROOF_IMAGES = [
  {
    src: "/proof/ttft-capture-1.png",
    alt: "Browser performance recording showing a representative TTFT capture",
  },
  {
    src: "/proof/ttft-capture-2.png",
    alt: "Browser performance recording showing a second representative capture",
  },
] as const;

/**
 * Long-form explainer for the informal TTFT check referenced on the landing page.
 * Rendered at `/site/ttft`.
 */
export const TtftTestPage: React.FC = () => {
  React.useEffect(() => {
    try {
      const oneYear = 60 * 60 * 24 * 365;
      document.cookie = `${LANDING_SEEN_COOKIE}=1; Max-Age=${oneYear}; Path=/; SameSite=Lax`;
    } catch {
      // Non-fatal
    }
  }, []);

  const handleLaunch = React.useCallback(() => {
    if (typeof window !== "undefined") {
      window.location.href = "/chat";
    }
  }, []);

  return (
    <div className="site-root site-subpage">
      <Nav onLaunch={handleLaunch} hashBase="/site" />
      <main>
        <article className="site-article">
          <a className="site-article__back" href="/site#performance">
            Back to performance
          </a>
          <h1 className="site-article__title">How we measured time to first token</h1>
          <p className="site-article__lede">
            The bar chart on the main page uses a deliberately simple, informal
            check. It is a heuristic, not a formal benchmark, and the numbers
            are only meant to show rough ordering between products under similar
            conditions.
          </p>

          <h2 className="site-article__h2">What we did</h2>
          <p className="site-article__p">
            We used the browser&rsquo;s own performance / developer tooling to
            time how long it takes for the first model token to appear after
            sending a new message. This is a basic monitor of perceived latency
            in the UI: no controlled lab, no server-side instrumentation, and
            no claim of statistical rigor. Results will vary with network,
            region, and load.
          </p>

          <h2 className="site-article__h2">Prompt (anti-cache)</h2>
          <p className="site-article__p">
            To reduce the effect of provider prompt caching, each send used the
            same one-off test phrase, including a random suffix:
          </p>
          <blockquote className="site-article__quote">
            What does the fox say? skmsdi31
          </blockquote>

          <h2 className="site-article__h2">Models</h2>
          <p className="site-article__p">
            We compared products using the same fast, non&ndash;reasoning
            &ldquo;instant&rdquo; class of model where available. On AgentChat
            and T3Chat that was <strong>Kimi K2 Instant</strong>. For ChatGPT
            and Google Gemini we used the closest equivalent: non-thinking, fast
            chat modes (e.g. ChatGPT Instant, Gemini fast / non-reasoning), not
            their heavy reasoning or long-context products.
          </p>

          <h2 className="site-article__h2">Reported medians (April 2026)</h2>
          <p className="site-article__p">
            Approximate time from send to first visible token, same test prompt
            and class of model as above.
          </p>
          <div className="site-article__table" role="table">
            <div className="site-article__tr site-article__tr--head" role="row">
              <span role="columnheader">Product / surface</span>
              <span role="columnheader">Time</span>
            </div>
            <div className="site-article__tr" role="row">
              <span>AgentChat (Kimi K2 Instant)</span>
              <span>1400&nbsp;ms</span>
            </div>
            <div className="site-article__tr" role="row">
              <span>Gemini (fast, non-reasoning)</span>
              <span>1710&nbsp;ms</span>
            </div>
            <div className="site-article__tr" role="row">
              <span>ChatGPT (Instant)</span>
              <span>2450&nbsp;ms</span>
            </div>
            <div className="site-article__tr" role="row">
              <span>T3Chat (Kimi K2 Instant)</span>
              <span>3500&nbsp;ms</span>
            </div>
          </div>

          <h2 className="site-article__h2">Screenshots</h2>
          <p className="site-article__p">
            Below are a couple of raw captures from the same style of
            measurement. They illustrate the setup; they are not a complete data
            set.
          </p>
          <div className="site-article__figures">
            {PROOF_IMAGES.map((im) => (
              <figure className="site-article__figure" key={im.src}>
                <img
                  className="site-article__img"
                  src={im.src}
                  alt={im.alt}
                  width={1200}
                  height={800}
                  loading="lazy"
                  decoding="async"
                />
              </figure>
            ))}
          </div>

          <p className="site-article__disclaimer">
            If you are evaluating providers for production, you should run your
            own tests in your own regions and with your own prompts. This page
            exists so we are transparent that our marketing number is a rough,
            in-browser spot check, not a whitepaper.
          </p>
        </article>
      </main>
      <Footer siteHashBase="/site" />
    </div>
  );
};
