import React, { useState, useEffect, useMemo, useRef, useDeferredValue } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Copy, Check, Download } from "lucide-react";
import "katex/dist/katex.min.css";
import type { ShikiRequest, ShikiResponse } from "../workers/shiki.worker";

// ─── Shiki Web Worker Singleton ──────────────────────────────────────────────
// All highlighting runs off the main thread so the RAF character-reveal loop
// and scrolling never compete with Shiki's AST parsing.

let shikiWorker: Worker | null = null;
let requestId = 0;
const pendingRequests = new Map<number, (html: string | null) => void>();

function getShikiWorker(): Worker {
  if (!shikiWorker) {
    shikiWorker = new Worker(
      new URL("../workers/shiki.worker.ts", import.meta.url),
      { type: "module" },
    );
    shikiWorker.onmessage = (e: MessageEvent<ShikiResponse>) => {
      const { id, html } = e.data;
      const resolve = pendingRequests.get(id);
      if (resolve) {
        pendingRequests.delete(id);
        resolve(html);
      }
    };
  }
  return shikiWorker;
}

function highlightCode(language: string, code: string): Promise<string | null> {
  return new Promise((resolve) => {
    const id = ++requestId;
    pendingRequests.set(id, resolve);
    getShikiWorker().postMessage({ id, language, code } satisfies ShikiRequest);
  });
}

// ─── CodeBlock ───────────────────────────────────────────────────────────────

const CodeBlock = React.memo(function CodeBlock({
  language,
  value,
  isStreaming,
}: {
  language: string;
  value: string;
  isStreaming?: boolean;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Track the last value we sent to the worker to avoid redundant requests
  const lastHighlightedValue = useRef<string>("");
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // During streaming: don't highlight, show raw text to avoid async flash.
    // Only send to worker once streaming settles or after a debounce gap.
    if (isStreaming) {
      // Clear any stale highlighted HTML when value changes during streaming
      if (html && value !== lastHighlightedValue.current) {
        setHtml(null);
      }
      return;
    }

    // Already highlighted this exact value
    if (value === lastHighlightedValue.current && html) return;

    // Debounce: wait 150ms after the last value change before highlighting.
    // This prevents thrashing the worker during the settle transition.
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      let cancelled = false;
      lastHighlightedValue.current = value;

      highlightCode(language, value).then((result) => {
        if (!cancelled) setHtml(result);
      });

      // Cleanup: if the effect re-runs before the worker responds, ignore stale results
      return () => { cancelled = true; };
    }, 150);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [language, value, isStreaming]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy!", err);
    }
  };

  const downloadCode = () => {
    const extension = language || "txt";
    const blob = new Blob([value], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `snippet-${Date.now()}.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="group relative my-6 flex min-h-8 flex-col overflow-hidden rounded-xl border border-chat-border bg-card/50 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-center justify-between border-b border-chat-border bg-muted/40 px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="size-2.5 rounded-full bg-red-500/20 border border-red-500/30" />
            <div className="size-2.5 rounded-full bg-yellow-500/20 border border-yellow-500/30" />
            <div className="size-2.5 rounded-full bg-green-500/20 border border-green-500/30" />
          </div>
          <span className="ml-2 text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-widest">
            {language || "text"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={copyToClipboard}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/60 transition-colors"
          >
            {copied ? (
              <Check size={14} className="text-green-500" />
            ) : (
              <Copy size={14} />
            )}
            <span className="min-w-[40px] text-left">
              {copied ? "Copied" : "Copy"}
            </span>
          </button>
          <button
            onClick={downloadCode}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted/60 transition-colors"
            title="Download"
          >
            <Download size={14} />
          </button>
        </div>
      </div>
      <div className="p-0 overflow-x-auto text-sm">
        {html ? (
          <div
            className="shiki-wrapper [&>pre]:!bg-transparent [&>pre]:!m-0 [&>pre]:p-4 [&>pre]:!leading-relaxed"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <pre className="min-h-8 p-4 m-0 font-mono leading-relaxed overflow-x-auto bg-transparent">
            <code>{value}</code>
          </pre>
        )}
      </div>
    </div>
  );
});

// ─── MarkdownMessage ─────────────────────────────────────────────────────────

export const MarkdownMessage = React.memo(function MarkdownMessage({
  content,
  isStreaming = false,
}: {
  content: string;
  isStreaming?: boolean;
}) {
  const [useFastRender, setUseFastRender] = useState(isStreaming);

  useEffect(() => {
    if (isStreaming) {
      setUseFastRender(true);
      return;
    }

    const timer = window.setTimeout(() => {
      setUseFastRender(false);
    }, 180);

    return () => window.clearTimeout(timer);
  }, [content, isStreaming]);

  // useDeferredValue lets React interrupt markdown rendering if new chunks arrive,
  // preventing render pile-up during fast streaming.
  // HOWEVER, it causes visual chunking. We bypass it during streaming for maximum smoothness.
  const deferredContent = useDeferredValue(content);
  const displayContent = useFastRender ? content : deferredContent;

  // During streaming: skip expensive math/katex parsing (remarkMath + rehypeKatex)
  // After streaming: full render with all plugins
  const remarkPlugins = useMemo(
    () => (useFastRender ? [remarkGfm] : [remarkGfm, remarkMath]),
    [useFastRender],
  );
  const rehypePlugins = useMemo(
    () => (useFastRender ? [] : [rehypeKatex]),
    [useFastRender],
  );

  // Stabilize the components reference to prevent ReactMarkdown from destroying the AST.
  // Capture `useFastRender` so CodeBlock knows whether streaming is active.
  const streamingRef = useRef(useFastRender);
  streamingRef.current = useFastRender;

  const components = useMemo(() => ({
    pre({ children, ...props }: any) {
      if (React.isValidElement(children)) {
        return (
          <>
            {React.cloneElement(children as React.ReactElement, {
              isBlock: true,
            } as any)}
          </>
        );
      }
      return <pre {...props}>{children}</pre>;
    },
    code({ node, inline, className, children, isBlock, ...props }: any) {
      const match = /language-(\w+)/.exec(className || "");
      const language = match ? match[1] : "";
      const value = String(children).replace(/\n$/, "");

      if (!isBlock) {
        return (
          <code
            className="bg-secondary/40 text-secondary-foreground px-1.5 py-0.5 rounded-md text-[0.9em] font-mono font-medium"
            {...props}
          >
            {children}
          </code>
        );
      }

      return <CodeBlock language={language} value={value} isStreaming={streamingRef.current} />;
    },
    span({ node, className, children, ...props }: any) {
      if (className?.includes("katex-display")) {
        return (
          <span
            className={`${className} my-6 block overflow-x-auto overflow-y-hidden`}
            {...props}
          >
            {children}
          </span>
        );
      }
      return (
        <span className={className} {...props}>
          {children}
        </span>
      );
    },
    p({ children }: any) {
      return <p className="mb-4 last:mb-0">{children}</p>;
    },
    a({ children, href }: any) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline font-medium transition-colors"
        >
          {children}
        </a>
      );
    },
    ul({ children }: any) {
      return (
        <ul className="list-disc pl-6 mb-4 space-y-1.5">{children}</ul>
      );
    },
    ol({ children }: any) {
      return (
        <ol className="list-decimal pl-6 mb-4 space-y-1.5">{children}</ol>
      );
    },
    li({ children }: any) {
      return <li className="pl-1">{children}</li>;
    },
    blockquote({ children }: any) {
      return (
        <blockquote className="border-l-4 border-primary/30 pl-4 italic text-muted-foreground my-4">
          {children}
        </blockquote>
      );
    },
  }), [useFastRender]);

  return (
    <div className="prose prose-neutral dark:prose-invert max-w-none break-words leading-relaxed selection:bg-primary/20">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {displayContent}
      </ReactMarkdown>
    </div>
  );
});
