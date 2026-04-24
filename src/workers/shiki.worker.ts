/**
 * Web Worker for Shiki syntax highlighting.
 *
 * Moves the heavy AST parsing and theme application off the main thread
 * so the RAF character-reveal loop and scrolling never stutter, even when
 * rendering massive code blocks during streaming.
 */

import { createHighlighter, type Highlighter } from "shiki";

let highlighter: Highlighter | null = null;
let highlighterReady: Promise<Highlighter> | null = null;

function ensureHighlighter() {
  if (highlighter) return Promise.resolve(highlighter);
  if (!highlighterReady) {
    highlighterReady = createHighlighter({
      themes: ["github-dark", "github-light"],
      langs: [
        "typescript",
        "javascript",
        "tsx",
        "jsx",
        "bash",
        "json",
        "python",
        "rust",
        "go",
        "markdown",
        "css",
        "html",
        "sql",
        "yaml",
      ],
    }).then((h) => {
      highlighter = h;
      return h;
    });
  }
  return highlighterReady;
}

// Pre-warm on worker init
ensureHighlighter();

export interface ShikiRequest {
  id: number;
  language: string;
  code: string;
}

export interface ShikiResponse {
  id: number;
  html: string | null;
  error?: string;
}

self.onmessage = async (e: MessageEvent<ShikiRequest>) => {
  const { id, language, code } = e.data;

  try {
    const h = await ensureHighlighter();
    const html = h.codeToHtml(code, {
      lang: language || "text",
      themes: {
        light: "github-light",
        dark: "github-dark",
      },
    });

    (self as unknown as Worker).postMessage({ id, html } satisfies ShikiResponse);
  } catch (err) {
    (self as unknown as Worker).postMessage({
      id,
      html: null,
      error: String(err),
    } satisfies ShikiResponse);
  }
};
