import { memo, useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  X,
  Search,
  Globe,
  ChevronDown,
  Brain,
  Radio,
  Activity,
  CheckCircle2,
  AlertCircle,
  Clock,
  Cpu,
  Network,
  Loader2,
  ExternalLink,
} from "lucide-react";
import type { SearchState, SearchStep, SearchStepAgent } from "~/lib/stream-manager";

// ── Tool icon mapping ────────────────────────────────────────────────────────

const toolConfig: Record<string, { icon: React.ReactNode; color: string; activeLabel: string }> = {
  planning: {
    icon: <Cpu size={12} />,
    color: "amber",
    activeLabel: "Analyzing query",
  },
  web_search: {
    icon: <Search size={12} />,
    color: "blue",
    activeLabel: "Searching the web",
  },
  scrape_websites: {
    icon: <Globe size={12} />,
    color: "violet",
    activeLabel: "Scraping websites",
  },
  research_swarm: {
    icon: <Network size={12} />,
    color: "cyan",
    activeLabel: "Research swarm running",
  },
  composing: {
    icon: <Brain size={12} />,
    color: "emerald",
    activeLabel: "Writing response",
  },
  answer: {
    icon: <Brain size={12} />,
    color: "emerald",
    activeLabel: "Composing answer",
  },
};

const statusColors = {
  running: "text-blue-400",
  done: "text-emerald-400",
  error: "text-red-400",
};

// ── Agent color palette ──────────────────────────────────────────────────────

const agentColors = [
  { text: "text-blue-400", dot: "bg-blue-400", ring: "ring-blue-500/30" },
  { text: "text-violet-400", dot: "bg-violet-400", ring: "ring-violet-500/30" },
  { text: "text-cyan-400", dot: "bg-cyan-400", ring: "ring-cyan-500/30" },
  { text: "text-amber-400", dot: "bg-amber-400", ring: "ring-amber-500/30" },
  { text: "text-rose-400", dot: "bg-rose-400", ring: "ring-rose-500/30" },
  { text: "text-emerald-400", dot: "bg-emerald-400", ring: "ring-emerald-500/30" },
];

// ── Elapsed timer ────────────────────────────────────────────────────────────

function ElapsedTimer({ startedAt, finishedAt }: { startedAt: number; finishedAt: number | null }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (finishedAt) return; // Stop ticking once finished
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [finishedAt]);

  const elapsed = Math.floor(((finishedAt ?? now) - startedAt) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const display = minutes > 0
    ? `${minutes}:${seconds.toString().padStart(2, "0")}`
    : `${seconds}s`;

  return (
    <div className="flex items-center gap-1.5">
      <Clock size={10} className="text-muted-foreground/40" />
      <span className="tabular-nums text-[11px] text-muted-foreground/50 font-mono">
        {display}
      </span>
    </div>
  );
}

// ── Step status icon ─────────────────────────────────────────────────────────

function StepStatusIcon({ status }: { status: string }) {
  if (status === "done") {
    return (
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <CheckCircle2 size={14} className="text-emerald-400" />
      </motion.div>
    );
  }
  if (status === "error") {
    return (
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        <AlertCircle size={14} className="text-red-400" />
      </motion.div>
    );
  }
  return (
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
    >
      <Loader2 size={14} className="text-blue-400" />
    </motion.div>
  );
}

// ── Swarm agent row ──────────────────────────────────────────────────────────

function SwarmAgentRow({ agent, index }: { agent: SearchStepAgent; index: number }) {
  const colors = agentColors[index % agentColors.length];
  const isActive = agent.status === "searching";
  const isDone = agent.status === "done";
  const isError = agent.status === "error";

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="flex items-start gap-2 py-1.5 pl-7"
    >
      {/* Status indicator */}
      <div className="mt-1 shrink-0">
        {isDone ? (
          <Check size={10} className="text-emerald-400" strokeWidth={3} />
        ) : isError ? (
          <X size={10} className="text-red-400" strokeWidth={3} />
        ) : isActive ? (
          <motion.div
            className={`size-2 rounded-full ${colors.dot}`}
            animate={{ opacity: [0.4, 1, 0.4], scale: [0.8, 1.2, 0.8] }}
            transition={{ duration: 1, repeat: Infinity, delay: index * 0.15 }}
          />
        ) : (
          <div className="size-2 rounded-full bg-muted-foreground/20" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-medium ${isDone ? "text-foreground/70" : isError ? "text-red-400/60 line-through" : isActive ? colors.text : "text-muted-foreground/40"}`}>
            {agent.label}
          </span>
          {isActive && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-0.5"
            >
              <motion.div
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              >
                <Radio size={7} className={colors.text} />
              </motion.div>
            </motion.div>
          )}
          {isDone && agent.sourceCount != null && (
            <span className="text-[9px] text-muted-foreground/35 font-mono">
              {agent.sourceCount} sources
            </span>
          )}
        </div>
        {agent.query && (
          <p className="text-[10px] font-mono text-muted-foreground/35 mt-0.5 truncate">
            {agent.query}
          </p>
        )}
        {isDone && agent.summary && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="text-[10px] text-muted-foreground/45 mt-1 line-clamp-2 leading-relaxed"
          >
            {agent.summary}
          </motion.p>
        )}
      </div>
    </motion.div>
  );
}

// ── Step card (one per tool call) ────────────────────────────────────────────

function StepCard({ step, index }: { step: SearchStep; index: number }) {
  const config = toolConfig[step.tool] ?? toolConfig.answer;
  const isRunning = step.status === "running";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
      className="relative"
    >
      {/* Connector line (not on first item) */}
      {index > 0 && (
        <div className="absolute left-[14px] -top-1.5 h-1.5 w-px bg-border/20" />
      )}

      <div className={`
        flex items-start gap-2.5 py-2 px-2.5 rounded-lg transition-all duration-300
        ${isRunning ? "bg-blue-500/[0.04]" : ""}
      `}>
        {/* Icon + status */}
        <div className="mt-0.5 shrink-0">
          <StepStatusIcon status={step.status} />
        </div>

        <div className="flex-1 min-w-0">
          {/* Tool label */}
          <div className="flex items-center gap-2 min-w-0">
            <div className={`flex items-center gap-1.5 ${statusColors[step.status] ?? "text-muted-foreground/50"}`}>
              {config.icon}
              <span className="text-[12px] font-semibold">
                {step.label}
              </span>
            </div>

            {isRunning && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-[9px] font-bold uppercase tracking-widest text-blue-400/60"
              >
                Running
              </motion.span>
            )}

            {step.status === "done" && step.sourceCount != null && (
              <span className="text-[10px] text-muted-foreground/40 font-mono">
                {step.sourceCount} sources
              </span>
            )}
          </div>

          {/* Input / query */}
          {step.input && (
            <div className="mt-1 flex items-start gap-1.5">
              <Search size={9} className="mt-0.5 text-muted-foreground/25 shrink-0" />
              <code className="text-[10px] font-mono text-muted-foreground/45 break-words leading-relaxed">
                {step.input}
              </code>
            </div>
          )}

          {/* Sources preview */}
          {step.status === "done" && step.sources && step.sources.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="mt-1.5 flex flex-wrap gap-1"
            >
              {step.sources.slice(0, 4).map((source, i) => (
                <a
                  key={i}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/30 hover:bg-muted/50 transition-colors text-[9px] text-muted-foreground/50 hover:text-muted-foreground/70 max-w-[180px] truncate"
                >
                  <ExternalLink size={7} className="shrink-0" />
                  <span className="truncate">{source.title || new URL(source.url).hostname}</span>
                </a>
              ))}
              {step.sources.length > 4 && (
                <span className="text-[9px] text-muted-foreground/30 px-1 py-0.5">
                  +{step.sources.length - 4} more
                </span>
              )}
            </motion.div>
          )}

          {/* Result summary */}
          {step.status === "done" && step.result && (
            <p className="mt-1 text-[10px] text-muted-foreground/40">
              {step.result}
            </p>
          )}

          {/* Error message */}
          {step.status === "error" && step.error && (
            <p className="mt-1 text-[10px] text-red-400/60">
              {step.error}
            </p>
          )}

          {/* Swarm agents (nested under research_swarm step) */}
          {step.agents && step.agents.length > 0 && (
            <div className="mt-2 border-l border-border/15 ml-0.5">
              {step.agents.map((agent, i) => (
                <SwarmAgentRow key={agent.id} agent={agent} index={i} />
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export const WebSearchProgress = memo(function WebSearchProgress({
  search,
}: {
  search: SearchState;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const isDone = search.done;
  const stepsDone = search.steps.filter((s) => s.status === "done").length;
  const stepsError = search.steps.filter((s) => s.status === "error").length;
  const stepsRunning = search.steps.filter((s) => s.status === "running").length;
  const totalSteps = search.steps.length;
  const totalSources = search.steps.reduce((sum, s) => sum + (s.sourceCount ?? 0), 0);

  // Auto-collapse when done
  useEffect(() => {
    if (isDone) {
      const timer = setTimeout(() => setIsExpanded(false), 800);
      return () => clearTimeout(timer);
    }
  }, [isDone]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="web-search-progress mx-auto w-full max-w-3xl mb-4"
    >
      <div className={`
        rounded-2xl border overflow-hidden backdrop-blur-xl transition-all duration-500
        ${isDone
          ? "border-emerald-500/20 bg-card/70 shadow-lg shadow-emerald-500/[0.05]"
          : "border-border/30 bg-card/60 shadow-xl shadow-black/[0.06]"
        }
      `}>
        {/* Header */}
        <button
          onClick={() => setIsExpanded((v) => !v)}
          className="relative flex w-full items-center justify-between gap-3 px-4 py-3 hover:bg-muted/10 transition-colors cursor-pointer outline-none focus-visible:bg-muted/20"
        >
          <div className="flex items-center gap-3 min-w-0">
            {/* Status icon */}
            <div className="relative flex items-center justify-center size-8 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 shrink-0">
              {isDone ? (
                <motion.div
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.3 }}
                >
                  <CheckCircle2 size={15} className="text-emerald-400" />
                </motion.div>
              ) : (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                >
                  <Activity size={15} className="text-blue-400" />
                </motion.div>
              )}
            </div>

            <div className="flex flex-col items-start min-w-0 text-left">
              <div className="flex items-center gap-2.5">
                <p className="text-sm font-semibold text-foreground">
                  {isDone ? "Search complete" : stepsRunning > 0 ? "Searching..." : "Preparing search"}
                </p>
                {isDone && totalSources > 0 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400"
                  >
                    <Check size={10} strokeWidth={3} />
                    <span className="text-[10px] font-bold">
                      {totalSources} source{totalSources !== 1 ? "s" : ""}
                    </span>
                  </motion.div>
                )}
                {!isDone && stepsRunning > 0 && (
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(stepsRunning, 3) }).map((_, i) => (
                      <motion.div
                        key={i}
                        className="size-1.5 rounded-full bg-blue-400"
                        animate={{ opacity: [0.4, 1, 0.4], scale: [0.8, 1.2, 0.8] }}
                        transition={{ duration: 1, repeat: Infinity, delay: i * 0.2, ease: "easeInOut" }}
                      />
                    ))}
                  </div>
                )}
              </div>
              {totalSteps > 0 && (
                <p className="text-[11px] text-muted-foreground/50 mt-0.5">
                  {isDone
                    ? `${stepsDone} step${stepsDone !== 1 ? "s" : ""} completed${stepsError > 0 ? `, ${stepsError} failed` : ""}`
                    : `${stepsRunning} running, ${stepsDone} done`
                  }
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <ElapsedTimer startedAt={search.startedAt} finishedAt={search.finishedAt} />
            {totalSteps > 0 && (
              <span className="text-[11px] font-mono font-medium text-muted-foreground/50 tabular-nums">
                {stepsDone + stepsError}<span className="text-muted-foreground/25">/{totalSteps}</span>
              </span>
            )}
            <motion.div
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <ChevronDown size={14} className="text-muted-foreground/30" />
            </motion.div>
          </div>
        </button>

        {/* Progress bar */}
        {totalSteps > 0 && (
          <div className="h-[2px] bg-muted/10 w-full flex overflow-hidden">
            {search.steps.map((step) => {
              const segWidth = 100 / totalSteps;
              return (
                <motion.div
                  key={step.id}
                  className="h-full transition-colors duration-500"
                  style={{
                    width: `${segWidth}%`,
                    backgroundColor:
                      step.status === "done" ? "rgb(34 197 94 / 0.6)" :
                      step.status === "error" ? "rgb(248 113 113 / 0.5)" :
                      step.status === "running" ? "rgb(96 165 250 / 0.5)" :
                      "transparent",
                  }}
                  animate={
                    step.status === "running"
                      ? { opacity: [0.4, 0.9, 0.4] }
                      : { opacity: 1 }
                  }
                  transition={
                    step.status === "running"
                      ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" }
                      : { duration: 0.5 }
                  }
                />
              );
            })}
          </div>
        )}

        {/* Expanded: Activity log */}
        <AnimatePresence initial={false}>
          {isExpanded && search.steps.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="px-2 py-2 space-y-0.5 border-t border-border/15">
                <AnimatePresence mode="popLayout">
                  {search.steps.map((step, i) => (
                    <StepCard key={step.id} step={step} index={i} />
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
});
