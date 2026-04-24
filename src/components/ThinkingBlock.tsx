import { useState, memo } from "react";
import { ChevronRight, ChevronDown, Brain } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { ReasoningState } from "~/lib/stream-manager";

interface ThinkingBlockProps {
  reasoning: ReasoningState;
  statusNote?: string;
}

export const ThinkingBlock = memo(function ThinkingBlock({ reasoning, statusNote }: ThinkingBlockProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { isThinking, displayedText } = reasoning;

  const hasContent = displayedText.length > 0;
  if (!isThinking && !hasContent) return null;

  return (
    <div className="mb-3">
      {/* Thinking indicator / toggle */}
      <button
        onClick={() => hasContent && setIsOpen((o) => !o)}
        className={`flex items-center gap-2 text-xs font-medium transition-colors ${
          hasContent
            ? "cursor-pointer text-muted-foreground hover:text-foreground"
            : "cursor-default text-muted-foreground"
        }`}
      >
        {isThinking ? (
          <div className="relative flex items-center justify-center h-4 w-4">
            <div className="absolute inset-0 rounded-full border-2 border-purple-400/30 border-t-purple-400 animate-spin" />
            <Brain size={10} className="text-purple-400" />
          </div>
        ) : (
          <Brain size={14} className="text-purple-400/70" />
        )}

        <span className={isThinking ? "text-purple-400" : ""}>
          {isThinking ? "Reasoning" : "Reasoning trace"}
        </span>

        {isThinking && (
          <span className="flex items-center gap-0.5">
            <span className="h-1 w-1 rounded-full bg-purple-400 animate-pulse [animation-delay:0ms]" />
            <span className="h-1 w-1 rounded-full bg-purple-400 animate-pulse [animation-delay:200ms]" />
            <span className="h-1 w-1 rounded-full bg-purple-400 animate-pulse [animation-delay:400ms]" />
          </span>
        )}

        {hasContent && (
          isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />
        )}
      </button>

      {isThinking && statusNote && (
        <div className="mt-1 ml-6 text-[11px] text-muted-foreground/80">
          {statusNote}
        </div>
      )}

      {/* Collapsible reasoning content */}
      <AnimatePresence>
        {isOpen && hasContent && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="mt-2 ml-1 pl-3 border-l-2 border-purple-400/20 text-xs text-muted-foreground/80 whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">
              {displayedText}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
