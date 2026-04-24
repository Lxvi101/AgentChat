import {
  useState,
  useRef,
  useEffect,
  useMemo,
  memo,
  useCallback,
  useSyncExternalStore,
} from "react";
import {
  Sparkles,
  Clock,
  DollarSign,
  Download,
  Copy,
  Trash2,
  ExternalLink,
  Check,
  Plus,
  Image as ImageIcon,
  Loader2,
  ClipboardCopy,
  X,
  Bookmark,
  ChevronLeft,
  AlertTriangle,
  ImagePlus,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import {
  IMAGE_MODELS,
  ASPECT_RATIOS,
  RESOLUTIONS,
  getImageDimensions,
  estimateCost,
  getResolutionInfo,
  type AspectRatio,
  type Resolution,
} from "~/lib/image-models";
import { useFileUpload } from "~/hooks/useFileUpload";
import { imageStore, type PendingImageGeneration } from "~/lib/image-store";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "~/components/ui/context-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { toast } from "sonner";
import { v4 as uuid } from "uuid";

// ─── Types ──────────────────────────────────────────────────────────────────

type GridItem =
  | { type: "pending"; data: PendingImageGeneration }
  | {
      type: "completed";
      data: {
        _id: Id<"imageGenerations">;
        prompt: string;
        modelId: string;
        modelName: string;
        aspectRatio: string;
        resolution: string;
        imageUrl: string;
        width: number;
        height: number;
        generationTime: number;
        cost: number;
        seed?: number;
        _creationTime: number;
      };
    };

export interface ReferenceImage {
  id: string;
  file: File;
  previewUrl: string;
  fileId: Id<"files"> | null;
  uploading: boolean;
  error?: string;
}

const MAX_REFERENCES = 4;

// ─── Hook: useImageStudio ───────────────────────────────────────────────────

export function useImageStudio(onAuthRequired?: () => void) {
  const [prompt, setPrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState("nano-banana");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [resolution, setResolution] = useState<Resolution>("standard");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ─── Reference images ─────────────────────────────────────────────
  const [references, setReferences] = useState<ReferenceImage[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const referencesCleanupRef = useRef<ReferenceImage[]>([]);
  const { uploadFile } = useFileUpload();

  // Keep cleanup ref in sync
  useEffect(() => {
    referencesCleanupRef.current = references;
  }, [references]);

  // Revoke object URLs on unmount
  useEffect(() => {
    return () => {
      for (const ref of referencesCleanupRef.current) {
        URL.revokeObjectURL(ref.previewUrl);
      }
    };
  }, []);

  const handleAddReferences = useCallback(
    async (files: FileList | File[]) => {
      const imageFiles = Array.from(files).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (imageFiles.length === 0) return;

      const newRefs: ReferenceImage[] = imageFiles.map((file) => ({
        id: uuid(),
        file,
        previewUrl: URL.createObjectURL(file),
        fileId: null,
        uploading: true,
      }));

      // Respect max limit
      setReferences((prev) => [...prev, ...newRefs].slice(0, MAX_REFERENCES));

      // Upload each concurrently
      await Promise.allSettled(
        newRefs.map(async (ref) => {
          try {
            const fileId = await uploadFile(ref.file);
            setReferences((prev) =>
              prev.map((r) =>
                r.id === ref.id ? { ...r, fileId, uploading: false } : r,
              ),
            );
          } catch (e: any) {
            setReferences((prev) =>
              prev.map((r) =>
                r.id === ref.id
                  ? {
                      ...r,
                      uploading: false,
                      error: e?.message ?? "Upload failed",
                    }
                  : r,
              ),
            );
            toast.error(`Failed to upload ${ref.file.name}`);
          }
        }),
      );
    },
    [uploadFile],
  );

  const handleRemoveReference = useCallback((id: string) => {
    setReferences((prev) => {
      const ref = prev.find((r) => r.id === id);
      if (ref) URL.revokeObjectURL(ref.previewUrl);
      return prev.filter((r) => r.id !== id);
    });
  }, []);

  const handleClearReferences = useCallback(() => {
    setReferences((prev) => {
      for (const ref of prev) URL.revokeObjectURL(ref.previewUrl);
      return [];
    });
  }, []);

  // Convex data
  const generations = useQuery(api.imageGenerations.list);
  const removeGeneration = useMutation(api.imageGenerations.remove);

  // Pending generations from the global store
  useSyncExternalStore(
    imageStore.subscribe,
    imageStore.getSnapshotVersion,
    imageStore.getSnapshotVersion,
  );
  const pending = imageStore.getItems();

  // Merge pending + completed for display
  const gridItems: GridItem[] = useMemo(() => {
    const items: GridItem[] = [];
    for (const p of pending) {
      items.push({ type: "pending", data: p });
    }
    if (generations) {
      for (const g of generations) {
        items.push({ type: "completed", data: g as any });
      }
    }
    return items;
  }, [pending, generations]);

  // Current model info
  const currentModel = IMAGE_MODELS.find((m) => m.id === selectedModel);
  const modelSupportsRefs = currentModel?.supportsReferences ?? false;

  // Generate handler
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;

    // If an auth callback is provided, call it and bail out early.
    // The parent decides whether the user is actually authenticated.
    if (onAuthRequired) {
      onAuthRequired();
      return;
    }

    const model = IMAGE_MODELS.find((m) => m.id === selectedModel);
    if (!model) return;

    // Check if any references are still uploading
    const uploadingRefs = references.filter((r) => r.uploading);
    if (uploadingRefs.length > 0) {
      toast.error("Please wait for reference images to finish uploading");
      return;
    }

    const dims = getImageDimensions(
      aspectRatio,
      resolution,
      model.maxResolution,
    );
    const pendingId = uuid();

    // Add optimistic pending entry
    imageStore.add({
      id: pendingId,
      prompt: prompt.trim(),
      modelId: selectedModel,
      modelName: model.name,
      aspectRatio,
      resolution,
      status: "generating",
      startedAt: Date.now(),
      width: dims.width,
      height: dims.height,
    });

    // Build request body, only include references for supporting models
    const readyRefs = references.filter((r) => r.fileId && !r.error);
    const includeRefs =
      model.supportsReferences && readyRefs.length > 0;

    const requestBody: Record<string, any> = {
      prompt: prompt.trim(),
      modelId: selectedModel,
      aspectRatio,
      resolution,
    };
    if (includeRefs) {
      requestBody.referenceFileIds = readyRefs.map((r) => r.fileId);
    }

    try {
      const res = await fetch("/api/image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ error: "Request failed" }));
        imageStore.setError(pendingId, err.error ?? "Generation failed");
        toast.error(err.error ?? "Image generation failed");
        return;
      }

      // Success, Convex real-time sync will surface the completed image.
      imageStore.remove(pendingId);
    } catch (e: any) {
      imageStore.setError(pendingId, e?.message ?? "Network error");
      toast.error("Network error, check your connection");
    }
  }, [prompt, selectedModel, aspectRatio, resolution, references, onAuthRequired]);

  // Keyboard shortcut: Ctrl/Cmd+Enter to generate
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleGenerate();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleGenerate]);

  // Delete handler
  const handleDelete = useCallback(
    (item: GridItem) => {
      if (item.type === "pending") {
        imageStore.remove(item.data.id);
      } else {
        removeGeneration({ id: item.data._id });
        toast.success("Image deleted");
      }
    },
    [removeGeneration],
  );

  const estCost = currentModel ? estimateCost(currentModel, resolution) : 0;

  return {
    prompt,
    setPrompt,
    selectedModel,
    setSelectedModel,
    aspectRatio,
    setAspectRatio,
    resolution,
    setResolution,
    textareaRef,
    gridItems,
    pending,
    handleGenerate,
    handleDelete,
    estCost,
    // Reference image state
    references,
    handleAddReferences,
    handleRemoveReference,
    handleClearReferences,
    fileInputRef,
    modelSupportsRefs,
  };
}

// ─── Sidebar Content ────────────────────────────────────────────────────────

export const ImageStudioSidebar = memo(function ImageStudioSidebar({
  prompt,
  setPrompt,
  selectedModel,
  setSelectedModel,
  aspectRatio,
  setAspectRatio,
  resolution,
  setResolution,
  textareaRef,
  pending,
  handleGenerate,
  estCost,
  onBack,
  references,
  handleAddReferences,
  handleRemoveReference,
  handleClearReferences,
  fileInputRef,
  modelSupportsRefs,
}: {
  prompt: string;
  setPrompt: (v: string) => void;
  selectedModel: string;
  setSelectedModel: (v: string) => void;
  aspectRatio: AspectRatio;
  setAspectRatio: (v: AspectRatio) => void;
  resolution: Resolution;
  setResolution: (v: Resolution) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  pending: PendingImageGeneration[];
  handleGenerate: () => void;
  estCost: number;
  onBack: () => void;
  references: ReferenceImage[];
  handleAddReferences: (files: FileList | File[]) => void;
  handleRemoveReference: (id: string) => void;
  handleClearReferences: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  modelSupportsRefs: boolean;
}) {
  // Drag-and-drop state for the references zone
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        handleAddReferences(e.dataTransfer.files);
      }
    },
    [handleAddReferences],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            handleAddReferences(e.target.files);
            e.target.value = ""; // Reset so same file can be re-selected
          }
        }}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <h1 className="text-lg font-bold text-foreground tracking-tight">
            AgentChat
          </h1>
          <span className="text-xs font-medium text-studio-accent bg-studio-accent/10 px-1.5 py-0.5 rounded-md">
            Studio
          </span>
        </div>
      </div>

      {/* Scrollable sidebar body */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-5 no-scrollbar">
        {/* PROMPT */}
        <section>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            <Sparkles size={12} className="text-studio-accent" />
            Prompt
          </label>
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe your image..."
            rows={3}
            className="w-full rounded-lg bg-muted/50 border border-border/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-studio-accent/50 focus:ring-1 focus:ring-studio-accent/20 resize-none transition-colors"
          />
        </section>

        {/* REFERENCES */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Bookmark size={12} />
              References
              {references.length > 0 && (
                <span className="text-[10px] font-semibold text-studio-accent bg-studio-accent/10 px-1.5 py-0.5 rounded-full ml-1">
                  {references.length}
                </span>
              )}
            </label>
            <div className="flex items-center gap-1">
              {references.length > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleClearReferences}
                      className="p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <X size={13} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    Clear all references
                  </TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={references.length >= MAX_REFERENCES}
                    className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Plus size={14} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {references.length >= MAX_REFERENCES
                    ? `Max ${MAX_REFERENCES} references`
                    : "Add reference image"}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {references.length === 0 ? (
            /* ─── Empty drop zone ─── */
            <button
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`w-full rounded-lg border-2 border-dashed py-4 px-3 flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                isDragOver
                  ? "border-studio-accent/50 bg-studio-accent/5"
                  : "border-border/40 hover:border-border/60 hover:bg-muted/30"
              }`}
            >
              <ImagePlus
                size={18}
                className={`transition-colors ${isDragOver ? "text-studio-accent" : "text-muted-foreground/40"}`}
              />
              <span className="text-xs text-muted-foreground/60">
                Drop images or click to add
              </span>
            </button>
          ) : (
            /* ─── Reference thumbnails ─── */
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`rounded-lg transition-colors ${isDragOver ? "ring-1 ring-studio-accent/30 bg-studio-accent/5" : ""}`}
            >
              <div className="grid grid-cols-4 gap-1.5">
                {references.map((ref) => (
                  <div key={ref.id} className="relative group aspect-square">
                    <img
                      src={ref.previewUrl}
                      alt="Reference"
                      className={`w-full h-full object-cover rounded-lg border transition-all ${
                        ref.error
                          ? "border-destructive/40 opacity-50"
                          : ref.uploading
                            ? "border-border/40 opacity-70"
                            : "border-border/30"
                      }`}
                    />
                    {/* Upload spinner overlay */}
                    {ref.uploading && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/20">
                        <Loader2
                          size={14}
                          className="animate-spin text-white"
                        />
                      </div>
                    )}
                    {/* Error overlay */}
                    {ref.error && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-destructive/10">
                        <AlertTriangle
                          size={12}
                          className="text-destructive"
                        />
                      </div>
                    )}
                    {/* Remove button */}
                    <button
                      onClick={() => handleRemoveReference(ref.id)}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-foreground/80 text-background flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity scale-90 group-hover:scale-100 hover:bg-foreground"
                    >
                      <X size={8} />
                    </button>
                  </div>
                ))}
                {/* Add more button (inline) */}
                {references.length < MAX_REFERENCES && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-square rounded-lg border-2 border-dashed border-border/30 flex items-center justify-center hover:border-border/50 hover:bg-muted/30 transition-all"
                  >
                    <Plus
                      size={14}
                      className="text-muted-foreground/40"
                    />
                  </button>
                )}
              </div>

              {/* Model compatibility warning */}
              {!modelSupportsRefs && references.length > 0 && (
                <div className="flex items-center gap-1.5 mt-2 px-1">
                  <AlertTriangle
                    size={11}
                    className="text-amber-500 shrink-0"
                  />
                  <span className="text-[10px] text-amber-500/80 leading-tight">
                    {
                      IMAGE_MODELS.find((m) => m.id === selectedModel)
                        ?.name ?? "This model"
                    }{" "}
                    doesn't support references, they'll be ignored
                  </span>
                </div>
              )}

              {/* Active reference hint */}
              {modelSupportsRefs && references.length > 0 && (
                <p className="text-[10px] text-studio-accent/70 mt-2 px-1">
                  References will guide the generation via the{" "}
                  {IMAGE_MODELS.find((m) => m.id === selectedModel)?.name ?? "model"}'s
                  edit mode
                </p>
              )}
            </div>
          )}
        </section>

        {/* MODELS */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Sparkles size={12} />
              Models
            </label>
            <span className="text-[10px] font-semibold text-studio-accent bg-studio-accent/10 px-1.5 py-0.5 rounded-full">
              1 active
            </span>
          </div>
          <div className="space-y-1">
            {IMAGE_MODELS.map((model) => {
              const isActive = model.id === selectedModel;
              return (
                <button
                  key={model.id}
                  onClick={() => setSelectedModel(model.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-all ${
                    isActive
                      ? "bg-studio-accent/8 border border-studio-accent/20"
                      : "hover:bg-muted/50 border border-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-sm font-semibold ${
                        isActive ? "text-foreground" : "text-foreground/80"
                      }`}
                    >
                      {model.name}
                    </span>
                    <div
                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                        isActive
                          ? "border-studio-accent bg-studio-accent"
                          : "border-muted-foreground/30"
                      }`}
                    >
                      {isActive && <Check size={10} className="text-white" />}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {model.description}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* ASPECT RATIO */}
        <section>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            <ImageIcon size={12} />
            Aspect Ratio
          </label>
          <div className="grid grid-cols-6 gap-1.5">
            {ASPECT_RATIOS.map((ar) => {
              const isActive = ar.id === aspectRatio;
              const maxDim = 28;
              const scale = maxDim / Math.max(ar.width, ar.height);
              const boxW = Math.round(ar.width * scale);
              const boxH = Math.round(ar.height * scale);
              return (
                <Tooltip key={ar.id}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setAspectRatio(ar.id)}
                      className={`flex flex-col items-center gap-1 rounded-lg py-2 transition-all ${
                        isActive
                          ? "bg-studio-accent/10 border border-studio-accent/25"
                          : "hover:bg-muted/50 border border-transparent"
                      }`}
                    >
                      <div
                        className={`rounded-sm transition-colors ${
                          isActive
                            ? "bg-studio-accent/60 border border-studio-accent"
                            : "bg-muted-foreground/15 border border-muted-foreground/25"
                        }`}
                        style={{ width: boxW, height: boxH }}
                      />
                      <span
                        className={`text-[9px] font-medium ${
                          isActive
                            ? "text-studio-accent"
                            : "text-muted-foreground"
                        }`}
                      >
                        {ar.label}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {ar.label}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </section>

        {/* RESOLUTION */}
        <section>
          {(() => {
            const currentModel = IMAGE_MODELS.find((m) => m.id === selectedModel);
            const resInfo = currentModel
              ? getResolutionInfo(currentModel, resolution)
              : null;
            return (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 cursor-help w-fit">
                      Resolution
                      <span className="text-[10px] text-muted-foreground/40 normal-case font-normal">
                        ?
                      </span>
                    </label>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs max-w-[200px]">
                    {resInfo?.tooltip ?? "Controls image resolution"}
                  </TooltipContent>
                </Tooltip>
                <div className="flex rounded-lg bg-muted/50 border border-border/50 p-0.5">
                  {RESOLUTIONS.map((res) => {
                    const isActive = res.id === resolution;
                    return (
                      <Tooltip key={res.id}>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => setResolution(res.id)}
                            className={`flex-1 text-center py-1.5 rounded-md text-xs font-medium transition-all ${
                              isActive
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {res.label}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">
                          {currentModel
                            ? getResolutionInfo(currentModel, res.id).description
                            : res.description}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground/60 mt-1.5 text-center">
                  {resInfo?.description ?? RESOLUTIONS.find((r) => r.id === resolution)?.description}
                  {estCost > 0 && (
                    <span className="ml-1.5">&middot; ~${estCost.toFixed(3)}/image</span>
                  )}
                </p>
              </>
            );
          })()}
        </section>
      </div>

      {/* Generate button - fixed at bottom */}
      <div className="px-4 pb-4 pt-2 border-t border-border/30">
        <button
          onClick={handleGenerate}
          disabled={
            !prompt.trim() || pending.some((p) => p.status === "generating")
          }
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-studio-accent text-white font-semibold py-2.5 px-4 text-sm shadow-sm hover:bg-studio-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] button-reflect"
        >
          {pending.some((p) => p.status === "generating") ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Sparkles size={16} />
          )}
          Generate
        </button>
      </div>
    </div>
  );
});

// ─── Main Content (Masonry Grid) ────────────────────────────────────────────

export const ImageStudioContent = memo(function ImageStudioContent({
  gridItems,
  pending,
  handleDelete,
}: {
  gridItems: GridItem[];
  pending: PendingImageGeneration[];
  handleDelete: (item: GridItem) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6">
      {gridItems.length === 0 && !pending.length ? (
        <EmptyState />
      ) : (
        <div className="studio-masonry-grid">
          {gridItems.map((item) => (
            <ImageCard
              key={
                item.type === "pending"
                  ? `pending-${item.data.id}`
                  : `completed-${item.data._id}`
              }
              item={item}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
});

// ─── Empty State ────────────────────────────────────────────────────────────

const EmptyState = memo(function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-20">
      <div className="w-16 h-16 rounded-2xl bg-studio-accent/10 flex items-center justify-center mb-4">
        <ImageIcon size={28} className="text-studio-accent" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">
        Create something beautiful
      </h3>
      <p className="text-sm text-muted-foreground max-w-xs">
        Describe your vision in the prompt and choose a model to start
        generating images.
      </p>
    </div>
  );
});

// ─── Image Card ─────────────────────────────────────────────────────────────

const ImageCard = memo(function ImageCard({
  item,
  onDelete,
}: {
  item: GridItem;
  onDelete: (item: GridItem) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);

  const isPending = item.type === "pending";
  const isError = isPending && item.data.status === "error";

  const prompt = item.type === "pending" ? item.data.prompt : item.data.prompt;
  const modelName =
    item.type === "pending" ? item.data.modelName : item.data.modelName;
  const width = item.type === "pending" ? item.data.width : item.data.width;
  const height = item.type === "pending" ? item.data.height : item.data.height;

  // Action handlers
  const handleSave = useCallback(() => {
    if (item.type !== "completed") return;
    const a = document.createElement("a");
    a.href = item.data.imageUrl;
    a.download = `${item.data.modelName.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}.png`;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success("Image download started");
  }, [item]);

  const handleCopyImage = useCallback(async () => {
    if (item.type !== "completed") return;
    try {
      const response = await fetch(item.data.imageUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
      toast.success("Image copied to clipboard");
    } catch {
      // Fallback: copy URL
      await navigator.clipboard.writeText(item.data.imageUrl);
      toast.success("Image URL copied");
    }
  }, [item]);

  const handleCopyPrompt = useCallback(async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    toast.success("Prompt copied");
    setTimeout(() => setCopied(false), 2000);
  }, [prompt]);

  const handleOpenFullRes = useCallback(() => {
    if (item.type !== "completed") return;
    window.open(item.data.imageUrl, "_blank", "noopener");
  }, [item]);

  const card = (
    <motion.div
      className="studio-masonry-item"
      initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="rounded-xl overflow-hidden bg-card border border-border/40 shadow-sm hover:shadow-md transition-shadow group">
        {/* Image / Loading area */}
        <div
          className="relative"
          style={{ aspectRatio: `${width}/${height}` }}
        >
          {isPending && !isError ? (
            <div className="absolute inset-0 studio-shimmer rounded-t-xl" />
          ) : isError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-destructive/5 text-destructive px-4">
              <X size={20} className="mb-1" />
              <p className="text-xs text-center">
                {item.data.error ?? "Generation failed"}
              </p>
            </div>
          ) : (
            <img
              src={item.type === "completed" ? item.data.imageUrl : ""}
              alt={prompt}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          )}

          {/* Hover overlay with action buttons */}
          {!isPending && (
            <AnimatePresence>
              {hovered && (
                <motion.div
                  className="absolute inset-x-0 top-0 p-2"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                >
                  <div className="flex items-center justify-between">
                    {/* Left: select */}
                    <button className="w-7 h-7 rounded-lg bg-black/30 backdrop-blur-md flex items-center justify-center text-white/80 hover:text-white hover:bg-black/50 transition-colors">
                      <div className="w-3.5 h-3.5 rounded-sm border-2 border-white/70" />
                    </button>
                    {/* Right: actions */}
                    <div className="flex items-center gap-1 rounded-lg bg-black/30 backdrop-blur-md p-0.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyImage();
                            }}
                            className="w-7 h-7 rounded-md flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                          >
                            <Copy size={13} />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">
                          Copy image
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSave();
                            }}
                            className="w-7 h-7 rounded-md flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                          >
                            <Download size={13} />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">
                          Save image
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(item);
                            }}
                            className="w-7 h-7 rounded-md flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">
                          Delete
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>

        {/* Metadata */}
        <div className="px-3 py-2.5">
          <p className="text-xs font-semibold text-foreground truncate">
            {modelName}
          </p>
          {item.type === "completed" ? (
            <div className="flex items-center gap-2.5 mt-1 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-0.5">
                <Clock size={10} />
                {item.data.generationTime}s
              </span>
              <span className="flex items-center gap-0.5">
                <DollarSign size={10} />${item.data.cost.toFixed(3)}
              </span>
            </div>
          ) : isPending && !isError ? (
            <div className="flex items-center gap-1 mt-1">
              <Loader2
                size={10}
                className="animate-spin text-studio-accent"
              />
              <span className="text-[10px] text-muted-foreground">
                Generating...
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </motion.div>
  );

  // Wrap completed cards with context menu
  if (item.type === "completed") {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>{card}</ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuItem
            onClick={handleSave}
            className="gap-2 cursor-pointer"
          >
            <Download size={14} className="text-studio-accent" />
            Save Image
          </ContextMenuItem>
          <ContextMenuItem
            onClick={handleCopyImage}
            className="gap-2 cursor-pointer"
          >
            <ClipboardCopy size={14} className="text-studio-accent" />
            Copy Image
          </ContextMenuItem>
          <ContextMenuItem
            onClick={handleCopyPrompt}
            className="gap-2 cursor-pointer"
          >
            <Copy size={14} className="text-studio-accent" />
            {copied ? "Copied!" : "Copy Prompt"}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={handleOpenFullRes}
            className="gap-2 cursor-pointer"
          >
            <ExternalLink size={14} className="text-studio-accent" />
            Open Full Resolution
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  // Pending/error cards: just the card, no context menu
  return card;
});
