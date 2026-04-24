import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  Dialog,
  DialogContent,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import TextareaAutosize from "react-textarea-autosize";
import {
  Loader2,
  Paperclip,
  X,
  FileText,
  FileCode,
  ImageIcon,
  Check,
} from "lucide-react";
import { Id } from "../../convex/_generated/dataModel";
import { useFileUpload } from "~/hooks/useFileUpload";
import { motion, AnimatePresence } from "framer-motion";
import {
  AgentEmojiPicker,
  DEFAULT_AGENT_EMOJI,
} from "~/components/AgentEmojiPicker";

function getFileIconByName(name: string) {
  if (name.match(/\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i)) return ImageIcon;
  if (name.match(/\.(js|ts|tsx|jsx|py|json|csv|md|html|css)$/i))
    return FileCode;
  return FileText;
}

function getFileColorByName(name: string) {
  if (name.match(/\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i))
    return "text-violet-500";
  if (name.match(/\.(js|ts|tsx|jsx)$/i)) return "text-yellow-500";
  if (name.match(/\.(py)$/i)) return "text-blue-500";
  if (name.match(/\.(json)$/i)) return "text-emerald-500";
  return "text-primary/70";
}

function getFileIconFromFile(file: File) {
  if (file.type.startsWith("image/")) return ImageIcon;
  if (
    file.type.includes("javascript") ||
    file.type.includes("typescript") ||
    file.name.match(/\.(js|ts|tsx|jsx|py|json|csv|md)$/)
  )
    return FileCode;
  return FileText;
}

function getFileColorFromFile(file: File) {
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

export function EditAgentDialog({
  agent,
  open,
  onOpenChange,
}: {
  agent: {
    _id: Id<"agents">;
    name: string;
    emoji?: string;
    systemPrompt?: string;
    includedFiles?: Id<"files">[];
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState<string>(DEFAULT_AGENT_EMOJI);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [keptFileIds, setKeptFileIds] = useState<Id<"files">[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading } = useFileUpload();
  const updateAgent = useMutation(api.agents.update);

  const existingFiles = useQuery(
    api.files.getFileUrls,
    agent?.includedFiles ? { fileIds: agent.includedFiles } : "skip"
  );

  useEffect(() => {
    if (agent) {
      setName(agent.name);
      setEmoji(agent.emoji || DEFAULT_AGENT_EMOJI);
      setSystemPrompt(agent.systemPrompt || "");
      setKeptFileIds(agent.includedFiles || []);
      setPendingFiles([]);
    }
  }, [agent]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      const allowedFiles = newFiles.filter(
        (f) => f.type !== "application/pdf"
      );
      setPendingFiles((prev) => [...prev, ...allowedFiles]);
    }
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const removeExistingFile = (id: Id<"files">) => {
    setKeptFileIds((prev) => prev.filter((keptId) => keptId !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !agent) return;

    setIsSubmitting(true);
    try {
      const uploadedFileIds: Id<"files">[] = [];
      for (const file of pendingFiles) {
        const fileId = await uploadFile(file);
        uploadedFileIds.push(fileId);
      }

      const finalFileIds = [...keptFileIds, ...uploadedFileIds];

      await updateAgent({
        agentId: agent._id,
        name,
        emoji: emoji || undefined,
        systemPrompt: systemPrompt.trim() || undefined,
        includedFiles: finalFileIds.length > 0 ? finalFileIds : undefined,
      });

      onOpenChange(false);
    } catch (error) {
      console.error("Failed to update agent:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const keptExisting =
    existingFiles?.filter(
      (f): f is typeof f & { _id: Id<"files"> } =>
        f._id != null && keptFileIds.includes(f._id)
    ) || [];
  const hasFiles = keptExisting.length > 0 || pendingFiles.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="duo-dialog max-w-md !p-0 overflow-hidden">
        {/* Header with emoji hero */}
        <div className="px-7 pt-8 pb-2 flex flex-col items-center">
          <AgentEmojiPicker
            value={emoji}
            onChange={setEmoji}
            size={96}
            variant="duo"
          />
          <h2 className="text-[22px] font-extrabold tracking-tight text-foreground mt-5 text-center leading-tight">
            Edit your agent
          </h2>
          <p className="text-sm text-muted-foreground mt-1 font-medium text-center">
            Tweak its name, voice, and knowledge
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-7 pt-6 pb-4 flex flex-col gap-5">
          {/* Name */}
          <div className="flex flex-col gap-2">
            <label className="duo-step-label">Agent name</label>
            <Input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="duo-input h-14 text-base px-4"
            />
          </div>

          {/* System prompt */}
          <div className="flex flex-col gap-2">
            <label className="duo-step-label">
              System prompt{" "}
              <span className="text-muted-foreground/50 normal-case tracking-normal font-medium ml-1">
                optional
              </span>
            </label>
            <TextareaAutosize
              minRows={4}
              maxRows={10}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="You are an expert developer…"
              className="duo-input w-full resize-none px-4 py-3.5 text-sm leading-relaxed"
            />
          </div>

          {/* Context files */}
          <div className="flex flex-col gap-3">
            <label className="duo-step-label">Context files</label>

            <AnimatePresence mode="popLayout">
              {hasFiles && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex flex-wrap gap-2"
                >
                  {keptExisting.map((file) => {
                    const fileName = file.name ?? "file";
                    const Icon = getFileIconByName(fileName);
                    const color = getFileColorByName(fileName);
                    return (
                      <motion.div
                        key={file._id}
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
                          {fileName}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeExistingFile(file._id)}
                          className="flex items-center justify-center size-5 rounded-full text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                          aria-label="Remove file"
                        >
                          <X size={11} />
                        </button>
                      </motion.div>
                    );
                  })}

                  {pendingFiles.map((file, i) => {
                    const Icon = getFileIconFromFile(file);
                    const color = getFileColorFromFile(file);
                    return (
                      <motion.div
                        key={`pending-${i}`}
                        initial={{ opacity: 0, scale: 0.7 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.7 }}
                        transition={{
                          type: "spring",
                          stiffness: 450,
                          damping: 28,
                        }}
                        layout
                        className="duo-chip duo-chip--new flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 text-xs"
                      >
                        <Icon size={13} className={color} />
                        <span className="truncate max-w-[130px] text-foreground/90">
                          {file.name}
                        </span>
                        <span className="text-[9px] text-primary font-extrabold uppercase tracking-wider">
                          new
                        </span>
                        <button
                          type="button"
                          onClick={() => removePendingFile(i)}
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
              accept="image/*,text/*,.md,.json,.js,.ts,.tsx,.py,.csv,audio/*"
            />
            <button
              type="button"
              className="duo-upload w-full flex items-center justify-center gap-2 py-4 text-sm cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip size={15} />
              <span>
                {hasFiles ? "Add more files" : "Attach files"}
              </span>
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2 pb-4">
            <Button
              type="button"
              onClick={() => onOpenChange(false)}
              className="duo-btn-secondary h-12 px-5"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || isSubmitting || isUploading}
              className="duo-btn-primary h-12 flex-1"
            >
              {isSubmitting || isUploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <Check size={16} className="mr-2 -ml-1" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
