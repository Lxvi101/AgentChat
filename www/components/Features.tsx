import * as React from "react";

/**
 * Feature grid in the x.ai "dense capabilities matrix" style. Four
 * tiles per row on wide screens, single column on mobile. Each tile
 * has a big numeric index, a title, a paragraph, and a subtle border
 * that highlights on hover.
 */

interface Feature {
  index: string;
  title: string;
  body: string;
}

const FEATURES: Feature[] = [
  {
    index: "01",
    title: "Frontier-parallel streaming",
    body: "Every supported model streams through a single SSE runtime with Redis fallbacks, no vendor lock-in, no dropped tokens on reconnect.",
  },
  {
    index: "02",
    title: "Zero-rerender UI",
    body: "Streamed tokens bypass React state entirely. A requestAnimationFrame painter writes directly to the DOM, keeping the UI at a hard 120fps even on low-end machines.",
  },
  {
    index: "03",
    title: "Concurrent DB + LLM",
    body: "We fire the database write and the LLM inference at the same instant. Cold TTFT lands below 120ms; warm hits under 60ms.",
  },
  {
    index: "04",
    title: "Agentic web search",
    body: "A parallel multi-agent swarm dispatched through FireCrawl. Visualized live, collapsible, with citations threaded through the final response.",
  },
  {
    index: "05",
    title: "Voice-first input",
    body: "Whisper v3 Turbo via a custom WebRTC pipe. Hold, speak, send, latency under half a second from release to stream.",
  },
  {
    index: "06",
    title: "Generate anything",
    body: "Image Studio built on Fal's latest diffusion models. Masonry gallery, shared history, one-click reruns across models.",
  },
  {
    index: "07",
    title: "Bring your own keys",
    body: "BYO keys for any provider, or fall back to the hosted tier. All keys are encrypted at rest and never logged.",
  },
  {
    index: "08",
    title: "Open source. MIT.",
    body: "Every line of the runtime is on GitHub. Self-host it, fork it, or deploy it to your own Vercel + Convex + Upstash stack in minutes.",
  },
];

export const Features: React.FC = () => (
  <section id="capabilities" className="site-features">
    <div className="site-section__lead">
      <div className="site-section__tag">/ capabilities</div>
      <h2 className="site-section__title">
        A runtime built for <em>speed</em>, designed for <em>humans</em>.
      </h2>
    </div>

    <div className="site-features__grid">
      {FEATURES.map((f) => (
        <article className="site-feature" key={f.index}>
          <div className="site-feature__index">{f.index}</div>
          <h3 className="site-feature__title">{f.title}</h3>
          <p className="site-feature__body">{f.body}</p>
        </article>
      ))}
    </div>
  </section>
);
