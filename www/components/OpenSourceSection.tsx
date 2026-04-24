import * as React from "react";

/**
 * Open-source / self-host section. Two columns: the pitch on the left,
 * a stylized `git clone` block on the right.
 */
export const OpenSourceSection: React.FC = () => (
  <section id="open-source" className="site-oss">
    <div className="site-oss__left">
      <div className="site-section__tag">/ open source</div>
      <h2 className="site-section__title">
        Your chat hub. Your infrastructure. Your rules.
      </h2>
      <p className="site-oss__body">
        AgentChat ships under the MIT license, with a one-command
        self-host recipe. Drop in your provider keys, point it at your
        own Convex deployment, and you&apos;re running in minutes.
      </p>
      <p className="site-oss__body">
        We don&apos;t gate features, don&apos;t phone home, and don&apos;t
        train on your conversations. The public hosted tier exists so
        you can kick the tires, nothing more.
      </p>
      <div className="site-oss__cta-row">
        <a
          href="https://github.com/Lxvi101/AgentChat"
          target="_blank"
          rel="noreferrer"
          className="site-cta site-cta--primary"
        >
          Star on GitHub
        </a>
        <a
          href="https://github.com/Lxvi101/AgentChat"
          target="_blank"
          rel="noreferrer"
          className="site-cta site-cta--ghost"
        >
          Read the deploy guide
        </a>
      </div>
    </div>

    <div className="site-oss__right">
      <div className="site-terminal" role="presentation">
        <header className="site-terminal__head">
          <span className="site-terminal__dot" />
          <span className="site-terminal__dot" />
          <span className="site-terminal__dot" />
          <span className="site-terminal__title">~/agentchat</span>
        </header>
        <pre className="site-terminal__body">
          <code>
            <span className="site-terminal__prompt">$</span>{" "}
            <span className="site-terminal__cmd">git clone</span>{" "}
            github.com/Lxvi101/AgentChat{"\n"}
            <span className="site-terminal__prompt">$</span>{" "}
            <span className="site-terminal__cmd">pnpm install</span>{"\n"}
            <span className="site-terminal__prompt">$</span>{" "}
            <span className="site-terminal__cmd">pnpm dev</span>{"\n"}
            <span className="site-terminal__muted">
              {"> ready on http://localhost:3000"}
            </span>
            {"\n"}
            <span className="site-terminal__muted">
              {"> TTFT: 58ms · frames: 120fps"}
            </span>
            {"\n"}
            <span className="site-terminal__prompt">$</span>
            <span className="site-terminal__caret">▊</span>
          </code>
        </pre>
      </div>
    </div>
  </section>
);
