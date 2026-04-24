import { z } from "zod";

// ── Firecrawl ────────────────────────────────────────────────────────────────

export interface FirecrawlSearchResult {
  url: string;
  title: string;
  description: string;
}

export interface FirecrawlScrapeResult {
  markdown: string;
  metadata: {
    title: string;
    url: string;
    statusCode: number;
  };
}

// ── Tool Call Types (the agent's available actions) ──────────────────────────

export type ToolName = "web_search" | "scrape_websites" | "research_swarm" | "planning" | "composing";

/** A single step logged from the orchestrator agent */
export interface SearchStep {
  id: string;
  tool: ToolName | "answer";
  /** Human-readable label for the step */
  label: string;
  /** Tool input summary (e.g. the query or URLs) */
  input?: string;
  status: "running" | "done" | "error";
  /** Optional result preview */
  result?: string;
  /** Source count if applicable */
  sourceCount?: number;
  sources?: { url: string; title: string }[];
  /** For research_swarm: child agent statuses */
  agents?: {
    id: string;
    label: string;
    query: string;
    status: "pending" | "searching" | "done" | "error";
    summary?: string;
    sourceCount?: number;
    sources?: { url: string; title: string }[];
  }[];
  error?: string;
}

// ── Events (for progress reporting) ──────────────────────────────────────────

export type SearchEvent =
  | { type: "step-start"; step: SearchStep }
  | { type: "step-update"; stepId: string; updates: Partial<SearchStep> }
  | { type: "step-done"; stepId: string; updates?: Partial<SearchStep> }
  | { type: "step-error"; stepId: string; error: string }
  | { type: "chunk"; text: string }
  | { type: "done"; answer: string };

// ── Orchestrator Options ─────────────────────────────────────────────────────

export interface SearchOptions {
  query: string;
  conversationContext?: string;
  model?: string;
  signal?: AbortSignal;
  onEvent?: (event: SearchEvent) => void;
}

export interface SearchResult {
  answer: string;
  steps?: SearchStep[];
}

// ── Agent internal types ─────────────────────────────────────────────────────

export interface DomainResult {
  id: string;
  label: string;
  query: string;
  searchResults: FirecrawlSearchResult[];
  scrapedContent: string[];
  summary: string;
  error: string | null;
}
