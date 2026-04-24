import * as React from "react";
import { Nav } from "./components/Nav";
import { Hero } from "./components/Hero";
import { LabsMarquee } from "./components/LabsMarquee";
import { Features } from "./components/Features";
import { Performance } from "./components/Performance";
import { ModelsSection } from "./components/ModelsSection";
import { OpenSourceSection } from "./components/OpenSourceSection";
import { CTA } from "./components/CTA";
import { Footer } from "./components/Footer";
import "./styles/landing.css";

// Cookie key used to short-circuit the `/` root-route redirect after the
// user has already seen the marketing page once. Name intentionally short
// to keep cookie headers tiny across the hot path.
export const LANDING_SEEN_COOKIE = "agentch_seen";

export interface LandingPageProps {
  /** Called when the user clicks any "Launch" button. */
  onLaunch?: () => void;
}

/**
 * The agentch.at / site landing page. Fully self-contained: it owns its
 * own dark theme, its own typography scale, and its own lifecycle.
 *
 * IMPORTANT: this component only runs on the `/site` route, so nothing
 * here touches the hot `/chat` path.
 */
export const LandingPage: React.FC<LandingPageProps> = ({ onLaunch }) => {
  // Mark the visitor as "seen" the moment the landing page mounts, so the
  // next time they hit the root URL we go straight to /chat.
  React.useEffect(() => {
    try {
      const oneYear = 60 * 60 * 24 * 365;
      document.cookie =
        `${LANDING_SEEN_COOKIE}=1; Max-Age=${oneYear}; Path=/; SameSite=Lax`;
    } catch {
      // Non-fatal: some embedded browsers disable document.cookie.
    }
  }, []);

  const handleLaunch = React.useCallback(() => {
    if (onLaunch) {
      onLaunch();
      return;
    }
    // Hard navigation to /chat (the app shell boots fresh, no stale
    // marketing CSS leaks into the chat theme).
    if (typeof window !== "undefined") {
      window.location.href = "/chat";
    }
  }, [onLaunch]);

  return (
    <div className="site-root">
      <Nav onLaunch={handleLaunch} />
      <main>
        <Hero onLaunch={handleLaunch} />
        <LabsMarquee />
        <Features />
        <Performance />
        <ModelsSection />
        <OpenSourceSection />
        <CTA onLaunch={handleLaunch} />
      </main>
      <Footer />
    </div>
  );
};

export default LandingPage;
