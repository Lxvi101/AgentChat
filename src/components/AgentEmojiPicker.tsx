import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { motion } from "framer-motion";

/**
 * The default emoji shown for an Agent when the user hasn't picked one.
 * Sidebar code should also fall back to this.
 */
export const DEFAULT_AGENT_EMOJI = "🤖";

/**
 * A curated grid of emojis that map naturally to Agent archetypes, * tech, research, writing, analysis, creative, lifestyle, nature, etc.
 * We keep this inline (no npm dep) to stay snappy and bundle-light.
 */
export const AGENT_EMOJI_OPTIONS: string[] = [
  // Agents & energy
  "🤖", "✨", "⚡", "🚀", "💡", "🎯", "🧠", "🔮",
  // Work & productivity
  "📝", "💻", "📊", "📈", "💼", "📚", "📖", "🗂️",
  // Research & analysis
  "🔬", "🧪", "🧬", "🔍", "🔎", "🗺️", "🧭", "📐",
  // Creative
  "🎨", "🎭", "🎵", "🎸", "📷", "🎬", "✏️", "🖌️",
  // Finance & commerce
  "💰", "💵", "🏦", "🛒", "📉", "🏢", "⚖️", "🧾",
  // Lifestyle & wellness
  "🍳", "🥗", "☕", "🏋️", "🧘", "🏃", "⚽", "🎮",
  // Nature & moods
  "🌱", "🌍", "🌊", "🔥", "❄️", "⭐", "☀️", "🌙",
  // Animals & characters
  "🐶", "🐱", "🦊", "🦁", "🐢", "🦉", "🐠", "🦋",
];

export function AgentEmojiPicker({
  value,
  onChange,
  size = 56,
  variant = "default",
}: {
  value: string | undefined;
  onChange: (emoji: string) => void;
  size?: number;
  variant?: "default" | "duo";
}) {
  const [open, setOpen] = useState(false);
  const current = value || DEFAULT_AGENT_EMOJI;
  const isDuo = variant === "duo";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <motion.button
          type="button"
          whileHover={isDuo ? undefined : { scale: 1.04 }}
          whileTap={isDuo ? undefined : { scale: 0.96 }}
          transition={{ type: "spring", stiffness: 400, damping: 22 }}
          className={
            isDuo
              ? "duo-emoji-trigger relative flex items-center justify-center cursor-pointer group"
              : "agent-icon-neo relative flex items-center justify-center rounded-2xl cursor-pointer group"
          }
          style={{
            width: size,
            height: size,
            animation: isDuo ? undefined : "agent-icon-float 4s ease-in-out infinite",
          }}
          aria-label="Pick an emoji for this agent"
        >
          <span
            className="leading-none select-none"
            style={{ fontSize: Math.round(size * 0.55) }}
          >
            {current}
          </span>
          {isDuo ? (
            <span className="absolute -bottom-2 -right-2 flex items-center justify-center size-7 rounded-full bg-primary text-primary-foreground text-xs font-bold shadow-[0_2px_0_0_color-mix(in_srgb,black_22%,var(--primary))] transition-transform group-active:translate-y-0.5 group-active:shadow-none">
              ✎
            </span>
          ) : (
            <span className="absolute -bottom-1 -right-1 flex items-center justify-center size-5 rounded-full bg-primary/10 border border-primary/20 text-[10px] text-primary/70 group-hover:bg-primary/20 transition-colors">
              ✎
            </span>
          )}
        </motion.button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        sideOffset={10}
        className="w-[296px] !p-3 rounded-2xl border-border/60"
      >
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-[10px] font-semibold text-muted-foreground tracking-wider uppercase">
            Pick an Emoji
          </span>
          <span className="text-[10px] text-muted-foreground/50">
            {AGENT_EMOJI_OPTIONS.length} options
          </span>
        </div>
        <div className="grid grid-cols-8 gap-1 max-h-[240px] overflow-y-auto pr-0.5">
          {AGENT_EMOJI_OPTIONS.map((e) => {
            const isActive = e === current;
            return (
              <motion.button
                key={e}
                type="button"
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.9 }}
                transition={{ type: "spring", stiffness: 500, damping: 20 }}
                onClick={() => {
                  onChange(e);
                  setOpen(false);
                }}
                className={`flex items-center justify-center size-8 rounded-lg text-lg transition-colors ${
                  isActive
                    ? "bg-primary/15 ring-1 ring-primary/40"
                    : "hover:bg-muted/60"
                }`}
                aria-label={`Use ${e}`}
              >
                <span className="leading-none">{e}</span>
              </motion.button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
