import * as React from "react";

export interface NavProps {
  onLaunch: () => void;
  /**
   * On landing, in-page nav uses bare hashes (`#section`). On marketing subpages
   * (e.g. `/site/ttft`) set to `"/site"` so anchors resolve to the main page.
   */
  hashBase?: string;
}

export const Nav: React.FC<NavProps> = ({ onLaunch, hashBase = "" }) => {
  const h = (id: string) => (hashBase ? `${hashBase}#${id}` : `#${id}`);
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 32);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav className={"site-nav" + (scrolled ? " site-nav--scrolled" : "")}>
      <a href="/site" className="site-nav__wordmark" aria-label="AgentChat">
        <Wordmark />
      </a>
      <div className="site-nav__links">
        <a href={h("capabilities")}>Capabilities</a>
        <a href={h("models")}>Models</a>
        <a href={h("performance")}>Performance</a>
        <a href={h("open-source")}>Open&nbsp;Source</a>
      </div>
      <div className="site-nav__actions">
        <a
          href="https://github.com/Lxvi101/AgentChat"
          target="_blank"
          rel="noopener noreferrer"
          className="site-nav__ghost"
        >
          GitHub
        </a>
        <button type="button" className="site-nav__cta" onClick={onLaunch}>
          Launch
        </button>
      </div>
    </nav>
  );
};

const Wordmark: React.FC = () => (
  <>
    <img
      src="/logos/Agent.svg"
      alt="AgentChat Logo"
      width={22}
      height={20}
      decoding="async"
    />
    AgentChat
  </>
);
