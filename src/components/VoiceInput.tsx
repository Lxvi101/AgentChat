import { useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Square, X, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useVoiceRecorder } from "~/hooks/useVoiceRecorder";

interface VoiceInputProps {
  onTranscription: (text: string) => void;
  disabled?: boolean;
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VoiceInput({ onTranscription, disabled }: VoiceInputProps) {
  const {
    state,
    startRecording,
    stopAndTranscribe,
    cancelRecording,
    retryTranscription,
    duration,
    error,
    reset,
  } = useVoiceRecorder();

  const handleStop = useCallback(async () => {
    const text = await stopAndTranscribe();
    if (text) onTranscription(text);
  }, [stopAndTranscribe, onTranscription]);

  const handleRetry = useCallback(async () => {
    const text = await retryTranscription();
    if (text) onTranscription(text);
  }, [retryTranscription, onTranscription]);

  useEffect(() => {
    if (error) {
      toast.error(error.message, { id: "voice-input-error" });
    }
  }, [error]);

  return (
    <div className="flex h-9 items-center justify-center">
      <AnimatePresence mode="wait">
        {state === "idle" && (
          <motion.button
            key="idle"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
            type="button"
            disabled={disabled}
            onClick={startRecording}
            className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/40 hover:text-foreground disabled:opacity-50 transition-all active:scale-95"
            title="Voice dictation"
          >
            <Mic size={20} />
          </motion.button>
        )}

        {state === "requesting-permission" && (
          <motion.div
            key="requesting"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
            className="flex size-9 items-center justify-center text-muted-foreground"
          >
            <Loader2 size={16} className="animate-spin" />
          </motion.div>
        )}

        {state === "recording" && (
          <motion.div
            key="recording"
            initial={{ opacity: 0, width: 36, scale: 0.9 }}
            animate={{ opacity: 1, width: "auto", scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="flex h-9 items-center gap-2 overflow-hidden rounded-full border border-destructive/20 bg-destructive/10 pl-3 pr-1 text-destructive shadow-sm"
          >
            <div className="size-2 shrink-0 animate-pulse rounded-full bg-destructive" />
            <span className="min-w-[36px] tabular-nums text-sm font-medium">
              {formatDuration(duration)}
            </span>
            <div className="mx-0.5 h-4 w-px shrink-0 bg-destructive/20" />
            <button
              type="button"
              onClick={cancelRecording}
              className="flex size-7 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-destructive/20"
              title="Cancel"
            >
              <X size={14} />
            </button>
            <button
              type="button"
              onClick={handleStop}
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/90"
              title="Stop & Transcribe"
            >
              <Square size={12} fill="currentColor" />
            </button>
          </motion.div>
        )}

        {state === "transcribing" && (
          <motion.div
            key="transcribing"
            initial={{ opacity: 0, width: 36, scale: 0.9 }}
            animate={{ opacity: 1, width: "auto", scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="flex h-9 items-center gap-2 whitespace-nowrap rounded-full border border-primary/20 bg-primary/10 px-3 text-primary shadow-sm"
          >
            <Loader2 size={14} className="shrink-0 animate-spin" />
            <span className="pr-1 text-sm font-medium">Transcribing...</span>
          </motion.div>
        )}

        {state === "error" && (
          <motion.div
            key="error"
            initial={{ opacity: 0, width: 36, scale: 0.9 }}
            animate={{ opacity: 1, width: "auto", scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="flex h-9 items-center gap-2 whitespace-nowrap rounded-full border border-destructive/20 bg-destructive/10 pl-3 pr-1 text-destructive shadow-sm"
          >
            <span
              className="max-w-[100px] truncate text-xs font-medium"
              title={error?.message}
            >
              {error?.type === "permission-denied"
                ? "Mic Denied"
                : error?.type === "recording-too-short"
                  ? "Too Short"
                  : "Error"}
            </span>
            <div className="mx-0.5 h-4 w-px shrink-0 bg-destructive/20" />
            {error?.type === "transcription-failed" && (
              <button
                type="button"
                onClick={handleRetry}
                className="flex size-7 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-destructive/20"
                title="Retry"
              >
                <RotateCcw size={12} />
              </button>
            )}
            <button
              type="button"
              onClick={reset}
              className="flex size-7 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-destructive/20"
              title="Dismiss"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
