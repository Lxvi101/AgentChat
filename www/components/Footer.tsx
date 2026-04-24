import * as React from "react";

function resolveFooterHref(
  href: string,
  siteHashBase: string | undefined,
): string {
  if (href.startsWith("#") && siteHashBase) {
    return `${siteHashBase.replace(/\/$/, "")}${href}`;
  }
  return href;
}

export interface FooterProps {
  /** Set to e.g. `"/site"` on marketing subpages so `#section` links hit the main landing. */
  siteHashBase?: string;
}

export const Footer: React.FC<FooterProps> = ({ siteHashBase }) => (
  <footer className="site-footer">
    <div className="site-footer__top">
      <div className="site-footer__brand">
        <div className="site-footer__mark">agentch.at</div>
        <p className="site-footer__tagline">
          The world&apos;s fastest open-source chat hub.
        </p>
      </div>

      <div className="site-footer__cols">
        <FooterCol
          title="Product"
          siteHashBase={siteHashBase}
          links={[
            ["Launch app", "/chat"],
            ["Studio", "/studio"],
            ["Settings", "/settings"],
            ["Pricing", "#open-source"],
          ]}
        />
        <FooterCol
          title="Open source"
          siteHashBase={siteHashBase}
          links={[
            ["GitHub", "https://github.com"],
            ["Self-host guide", "https://github.com"],
            ["Architecture", "https://github.com"],
            ["Changelog", "https://github.com"],
          ]}
        />
        <FooterCol
          title="Company"
          siteHashBase={siteHashBase}
          links={[
            ["Contact", "/settings/contact"],
            ["Privacy", "/site"],
            ["Terms", "/site"],
            ["Security", "/site"],
          ]}
        />
      </div>
    </div>

    <div className="site-footer__bottom">
      <span>© {new Date().getFullYear()} AgentChat Labs</span>
      <span>MIT licensed · open source</span>
    </div>
  </footer>
);

const FooterCol: React.FC<{
  title: string;
  siteHashBase?: string;
  links: [label: string, href: string][];
}> = ({ title, siteHashBase, links }) => (
  <div className="site-footer__col">
    <div className="site-footer__col-title">{title}</div>
    <ul>
      {links.map(([label, href]) => (
        <li key={label}>
          <a href={resolveFooterHref(href, siteHashBase)}>{label}</a>
        </li>
      ))}
    </ul>
  </div>
);
