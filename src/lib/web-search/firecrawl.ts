import type { FirecrawlSearchResult, FirecrawlScrapeResult } from "./types";

const FIRECRAWL_BASE = process.env.FIRECRAWL_BASE_URL ?? "https://api.firecrawl.dev";

function getAuthHeader(): string {
  const user = process.env.FIRECRAWL_USER ?? "";
  const pass = process.env.FIRECRAWL_PASS ?? "";
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

export async function firecrawlSearch(
  query: string,
  limit = 8,
  signal?: AbortSignal,
): Promise<FirecrawlSearchResult[]> {
  const res = await fetch(`${FIRECRAWL_BASE}/v2/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getAuthHeader(),
    },
    body: JSON.stringify({ query, limit }),
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[firecrawl] search error:", res.status, res.statusText, body.slice(0, 200));
    throw new Error(`Firecrawl search failed: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  const results = (json.data?.web ?? []) as FirecrawlSearchResult[];
  return results;
}

export async function firecrawlScrape(
  url: string,
  signal?: AbortSignal,
): Promise<FirecrawlScrapeResult> {
  const res = await fetch(`${FIRECRAWL_BASE}/v2/scrape`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getAuthHeader(),
    },
    body: JSON.stringify({ url }),
    signal,
  });

  if (!res.ok) {
    throw new Error(`Firecrawl scrape failed: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  return json.data as FirecrawlScrapeResult;
}
