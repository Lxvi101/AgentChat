import { useState, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  Dialog,
  DialogContent,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import TextareaAutosize from "react-textarea-autosize";
import { useFileUpload } from "~/hooks/useFileUpload";
import {
  Loader2,
  Paperclip,
  X,
  FileText,
  FileCode,
  ImageIcon,
  ArrowRight,
  ChevronLeft,
  Check,
} from "lucide-react";
import { Id } from "../../convex/_generated/dataModel";
import { motion, AnimatePresence } from "framer-motion";
import {
  AgentEmojiPicker,
  DEFAULT_AGENT_EMOJI,
} from "~/components/AgentEmojiPicker";

type Step = 0 | 1 | 2;
const TOTAL_STEPS = 3;

const STEP_HEADINGS: Record<Step, { title: string; subtitle: string }> = {
  0: {
    title: "Meet your new agent",
    subtitle: "Give it a name and face",
  },
  1: {
    title: "Teach it how to behave",
    subtitle: "Write custom instructions, or skip this",
  },
  2: {
    title: "Share some knowledge",
    subtitle: "Attach files your agent should always see",
  },
};

function getFileIcon(file: File) {
  if (file.type.startsWith("image/")) return ImageIcon;
  if (
    file.type.includes("javascript") ||
    file.type.includes("typescript") ||
    file.name.match(/\.(js|ts|tsx|jsx|py|json|csv|md)$/)
  )
    return FileCode;
  return FileText;
}

function getFileColor(file: File) {
  if (file.type.startsWith("image/")) return "text-violet-500";
  if (
    file.type.includes("javascript") ||
    file.type.includes("typescript") ||
    file.name.match(/\.(js|ts|tsx|jsx)$/)
  )
    return "text-yellow-500";
  if (file.name.match(/\.(py)$/)) return "text-blue-500";
  return "text-primary/70";
}

export function CreateAgentDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [step, setStep] = useState<Step>(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState<string>(DEFAULT_AGENT_EMOJI);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading } = useFileUpload();
  const createAgent = useMutation(api.agents.create);

  const resetAll = () => {
    setStep(0);
    setDirection(1);
    setName("");
    setEmoji(DEFAULT_AGENT_EMOJI);
    setSystemPrompt("");
    setPendingFiles([]);
  };

  const handleDialogChange = (nextOpen: boolean) => {
    if (!nextOpen) resetAll();
    onOpenChange(nextOpen);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      const allowedFiles = newFiles.filter(
        (f) => f.type !== "application/pdf"
      );
      setPendingFiles((prev) => [...prev, ...allowedFiles]);
    }
  };

  const removeFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const canContinue = step === 0 ? name.trim().length > 0 : true;
  const isLastStep = step === TOTAL_STEPS - 1;
  const progressPct = ((step + 1) / TOTAL_STEPS) * 100;

  const goNext = () => {
    if (!canContinue) return;
    if (isLastStep) {
      void handleSubmit();
      return;
    }
    setDirection(1);
    setStep((s) => (Math.min(s + 1, TOTAL_STEPS - 1) as Step));
  };

  const goBack = () => {
    setDirection(-1);
    setStep((s) => (Math.max(s - 1, 0) as Step));
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      const uploadedFileIds: Id<"files">[] = [];
      for (const file of pendingFiles) {
        const fileId = await uploadFile(file);
        uploadedFileIds.push(fileId);
      }

      await createAgent({
        name,
        emoji: emoji || undefined,
        systemPrompt: systemPrompt.trim() || undefined,
        includedFiles:
          uploadedFileIds.length > 0 ? uploadedFileIds : undefined,
      });

      resetAll();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to create agent:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    goNext();
  };

  const heading = STEP_HEADINGS[step];

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="duo-dialog max-w-md !p-0 overflow-hidden">
        {/* Progress bar + step counter */}
        <div className="px-7 pt-7 pb-2">
          <div className="flex items-center gap-3">
            <div className="duo-progress-track flex-1">
              <div
                className="duo-progress-fill"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="duo-step-label whitespace-nowrap">
              {step + 1} / {TOTAL_STEPS}
            </span>
          </div>
        </div>

        {/* Heading */}
        <div className="px-7 pt-5 pb-3">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`heading-${step}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22 }}
            >
              <h2 className="text-[22px] font-extrabold tracking-tight text-foreground leading-tight">
                {heading.title}
              </h2>
              <p className="text-sm text-muted-foreground mt-1 font-medium">
                {heading.subtitle}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Stepped body */}
        <form onSubmit={handleFormSubmit} className="px-7 pb-4">
          <div className="relative min-h-[280px]">
            <AnimatePresence mode="wait" initial={false} custom={direction}>
              <motion.div
                key={`step-${step}`}
                custom={direction}
                initial={{ opacity: 0, x: direction * 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction * -24 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="flex flex-col gap-6"
              >
                {step === 0 && (
                  <>
                    {/* Emoji hero */}
                    <div className="flex justify-center pt-3 pb-1">
                      <AgentEmojiPicker
                        value={emoji}
                        onChange={setEmoji}
                        size={108}
                        variant="duo"
                      />
                    </div>

                    {/* Name input */}
                    <div className="flex flex-col gap-2">
                      <label className="duo-step-label">Agent name</label>
                      <Input
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Python Tutor"
                        autoFocus
                        className="duo-input h-14 text-base px-4"
                      />
                    </div>
                  </>
                )}

                {step === 1 && (
                  <div className="flex flex-col gap-2">
                    <label className="duo-step-label">
                      System prompt{" "}
                      <span className="text-muted-foreground/50 normal-case tracking-normal font-medium ml-1">
                        optional
                      </span>
                    </label>
                    <TextareaAutosize
                      minRows={7}
                      maxRows={12}
                      value={systemPrompt}
                      onChange={(e) => setSystemPrompt(e.target.value)}
                      placeholder="You are an expert Python developer. Always explain your reasoning step-by-step and write unit tests for anything complex…"
                      className="duo-input w-full resize-none px-4 py-3.5 text-sm leading-relaxed"
                      autoFocus
                    />
                    <p className="text-xs text-muted-foreground/80 font-medium pt-1">
                      This sets your agent's voice, expertise, and rules.
                    </p>
                  </div>
                )}

                {step === 2 && (
                  <div className="flex flex-col gap-3">
                    <label className="duo-step-label">
                      Context files{" "}
                      <span className="text-muted-foreground/50 normal-case tracking-normal font-medium ml-1">
                        optional
                      </span>
                    </label>

                    <AnimatePresence mode="popLayout">
                      {pendingFiles.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="flex flex-wrap gap-2"
                        >
                          {pendingFiles.map((file, i) => {
                            const Icon = getFileIcon(file);
                            const color = getFileColor(file);
                            return (
                              <motion.div
                                key={`${file.name}-${i}`}
                                initial={{ opacity: 0, scale: 0.7 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.7 }}
                                transition={{
                                  type: "spring",
                                  stiffness: 450,
                                  damping: 28,
                                }}
                                layout
                                className="duo-chip flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 text-xs"
                              >
                                <Icon size={13} className={color} />
                                <span className="truncate max-w-[130px] text-foreground/90">
                                  {file.name}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => removeFile(i)}
                                  className="flex items-center justify-center size-5 rounded-full text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                                  aria-label="Remove file"
                                >
                                  <X size={11} />
                                </button>
                              </motion.div>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <input
                      type="file"
                      multiple
                      ref={fileInputRef}
                      className="hidden"
                      onChange={handleFileSelect}
                      accept="image/*,text/*,.md,.json,.js,.ts,.tsx,.py,.csv"
                    />
                    <button
                      type="button"
                      className="duo-upload w-full flex items-center justify-center gap-2 py-5 text-sm cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Paperclip size={15} />
                      <span>
                        {pendingFiles.length === 0
                          ? "Attach files"
                          : "Add more files"}
                      </span>
                    </button>
                    <p className="text-xs text-muted-foreground/80 font-medium pt-1">
                      Images, code, markdown, JSON, CSV, no PDFs.
                    </p>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Footer actions */}
          <div className="flex items-center gap-3 pt-4 pb-6">
            {step > 0 ? (
              <Button
                type="button"
                onClick={goBack}
                className="duo-btn-secondary h-12 px-5"
              >
                <ChevronLeft size={16} className="mr-1 -ml-1" />
                Back
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => handleDialogChange(false)}
                className="duo-btn-secondary h-12 px-5"
              >
                Cancel
              </Button>
            )}

            <Button
              type="submit"
              disabled={!canContinue || isSubmitting || isUploading}
              className="duo-btn-primary h-12 flex-1"
            >
              {isSubmitting || isUploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : isLastStep ? (
                <>
                  <Check size={16} className="mr-2 -ml-1" />
                  Create Agent
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight size={16} className="ml-2 -mr-1" />
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
