// src/components/ModelSelector.tsx
import React, { useState, useEffect, useMemo, useImperativeHandle, forwardRef } from "react";
import { ChevronDown, ChevronLeft, Search, Filter, Star, Info, Eye, Brain, SlidersHorizontal, Wrench, ImageIcon, FileText, BarChart3 } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "~/components/ui/popover";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "~/components/ui/dialog";
import { useIsMobile } from "~/hooks/use-mobile";
import { MODELS, type ModelConfig } from "~/lib/models";
import { PROVIDERS, getProvider } from "~/lib/providers";

const CAPABILITY_BADGES: { key: keyof ModelConfig; label: string; icon: React.ReactNode; color: string; bgColor: string; iconBg: string }[] = [
  { key: "vision", label: "Vision", icon: <Eye className="size-3" />, color: "text-emerald-600 dark:text-emerald-400", bgColor: "bg-emerald-500/10 border-emerald-500/20", iconBg: "bg-emerald-500/15" },
  { key: "reasoning", label: "Reasoning", icon: <Brain className="size-3" />, color: "text-purple-600 dark:text-purple-400", bgColor: "bg-purple-500/10 border-purple-500/20", iconBg: "bg-purple-500/15" },
  { key: "effortControl", label: "Effort Control", icon: <SlidersHorizontal className="size-3" />, color: "text-teal-600 dark:text-teal-400", bgColor: "bg-teal-500/10 border-teal-500/20", iconBg: "bg-teal-500/15" },
  { key: "toolCalling", label: "Tool Calling", icon: <Wrench className="size-3" />, color: "text-orange-600 dark:text-orange-400", bgColor: "bg-orange-500/10 border-orange-500/20", iconBg: "bg-orange-500/15" },
  { key: "imageGeneration", label: "Image Gen", icon: <ImageIcon className="size-3" />, color: "text-pink-600 dark:text-pink-400", bgColor: "bg-pink-500/10 border-pink-500/20", iconBg: "bg-pink-500/15" },
  { key: "pdfComprehension", label: "PDF Comprehension", icon: <FileText className="size-3" />, color: "text-rose-600 dark:text-rose-400", bgColor: "bg-rose-500/10 border-rose-500/20", iconBg: "bg-rose-500/15" },
];

function CostIndicator({ cost, costPlus }: { cost: number; costPlus?: boolean }) {
  return (
    <span className="inline-flex items-center gap-0 font-semibold tracking-tight text-xs">
      {Array.from({ length: 3 }).map((_, i) => (
        <span key={i} className={i < cost ? "text-emerald-600/80 dark:text-emerald-400/80" : "text-muted-foreground/30"}>
          {i < cost ? "$" : "·"}
        </span>
      ))}
      {costPlus && <span className="text-emerald-600/80 dark:text-emerald-400/80">+</span>}
    </span>
  );
}

function CapabilityDots({ model }: { model: ModelConfig }) {
  const caps = CAPABILITY_BADGES.filter(badge => model[badge.key]);
  if (caps.length === 0) return null;
  return (
    <div className="flex items-center gap-0.5">
      {caps.map(cap => (
        <span
          key={cap.key as string}
          className={`inline-flex items-center justify-center size-[18px] rounded-full ${cap.iconBg} ${cap.color}`}
          title={cap.label}
        >
          {React.cloneElement(cap.icon as React.ReactElement<{ className?: string }>, { className: "size-2.5" })}
        </span>
      ))}
    </div>
  );
}

function ModelDetailPanel({ model }: { model: ModelConfig }) {
  const provider = getProvider(model.providerId);
  const providerName = provider?.name || model.providerId;
  const developerName = model.developer || provider?.developer || providerName;
  const caps = CAPABILITY_BADGES.filter(badge => model[badge.key]);

  return (
    <div className="flex h-full flex-col overflow-y-auto no-scrollbar">
      <div className="p-5 space-y-5">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted/50 [&>*]:size-7 text-foreground">
            {provider && <provider.Icon />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-foreground truncate">{model.name}</h3>
              <CostIndicator cost={model.cost} costPlus={model.costPlus} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{model.description}</p>
          </div>
        </div>

        {/* Description */}
        <div>
          <h4 className="text-xs font-semibold text-foreground mb-1.5">Description</h4>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {model.longDescription || model.description}
          </p>
        </div>

        {/* Features */}
        {caps.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-foreground mb-2">Features</h4>
            <div className="flex flex-wrap gap-1.5">
              {caps.map(badge => (
                <span
                  key={badge.key as string}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none ${badge.bgColor} ${badge.color}`}
                >
                  {badge.icon}
                  {badge.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Metadata Grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <div>
            <p className="text-[11px] font-medium text-muted-foreground/70">Provider</p>
            <p className="text-xs font-medium text-foreground mt-0.5">{providerName}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted-foreground/70">Developer</p>
            <p className="text-xs font-medium text-foreground mt-0.5">{developerName}</p>
          </div>
          {model.knowledgeCutoff && (
            <div>
              <p className="text-[11px] font-medium text-muted-foreground/70">Knowledge Cutoff</p>
              <p className="text-xs font-medium text-foreground mt-0.5">{model.knowledgeCutoff}</p>
            </div>
          )}
          {model.addedOn && (
            <div>
              <p className="text-[11px] font-medium text-muted-foreground/70">Added On</p>
              <p className="text-xs font-medium text-foreground mt-0.5">{model.addedOn}</p>
            </div>
          )}
        </div>

        {/* Benchmark Performance */}
        <div>
          <h4 className="text-xs font-semibold text-foreground mb-3">Benchmark Performance</h4>
          <div className="flex flex-col items-center justify-center py-4 text-muted-foreground/40">
            <BarChart3 className="size-10 mb-2" />
            <p className="text-xs text-muted-foreground/50">Benchmarks unavailable for this model</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export interface ModelSelectorHandle {
  open: () => void;
}

// Shared inner content for the model selector panel
function ModelSelectorContent({
  selectedModel,
  onSelectModel,
  favoriteModels,
  onToggleFavorite,
  searchQuery,
  setSearchQuery,
  activeProvider,
  setActiveProvider,
  setOpen,
  detailModelId = null,
  setDetailModelId,
}: {
  selectedModel: string;
  onSelectModel: (model: string) => void;
  favoriteModels: string[];
  onToggleFavorite: (model: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  activeProvider: string;
  setActiveProvider: (p: string) => void;
  setOpen: (o: boolean) => void;
  detailModelId?: string | null;
  setDetailModelId?: (id: string | null) => void;
}) {

  const displayedModels = useMemo(() => {
    let filtered = MODELS;
    if (searchQuery.trim()) {
      filtered = filtered.filter(m =>
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    } else {
      if (activeProvider === "favorites") {
        filtered = filtered.filter(m => favoriteModels.includes(m.id));
      } else {
        filtered = filtered.filter(m => m.providerId === activeProvider);
      }
    }
    return filtered;
  }, [activeProvider, searchQuery, favoriteModels]);

  const mobileDetailModel = detailModelId ? MODELS.find(m => m.id === detailModelId) || null : null;

  return (
    <div className="relative overflow-hidden rounded-xl">
      <div className="absolute inset-0 opacity-0 dark:opacity-50" style={{ background: "var(--model-selector-gradient)" }}></div>
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        aria-hidden
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
        }}
      ></div>
      <div className="relative">
        <div className="flex items-center gap-2 px-4 pt-3 pb-2">
          <div className="flex flex-1 items-center border-b border-chat-border/50 pb-1">
            <Search className="mr-2.5 size-4 shrink-0 text-muted-foreground/60" />
            <input
              placeholder="Search models..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
              type="text"
            />
          </div>
          <button
            className="inline-flex cursor-pointer items-center justify-center size-9 relative shrink-0 rounded-lg text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
            type="button"
          >
            <Filter className="size-4" />
          </button>
        </div>

        <div className="relative h-[426px] max-h-[calc(100dvh-14rem)] overflow-hidden">
          {/* Mobile detail overlay */}
          {mobileDetailModel && (
            <div className="absolute inset-0 z-20 flex flex-col bg-background/95 sm:hidden animate-in slide-in-from-right duration-150">
              <div className="flex items-center gap-2 border-b border-chat-border/50 px-3 py-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  onClick={() => setDetailModelId?.(null)}
                >
                  <ChevronLeft className="size-4" />
                  Back
                </button>
              </div>
              <div className="flex-1 overflow-y-auto no-scrollbar">
                <ModelDetailPanel model={mobileDetailModel} />
              </div>
            </div>
          )}

          <div className="flex h-full">
            {/* Left Provider Bar */}
            <div className="relative h-full w-14 shrink-0">
              <div className="no-scrollbar flex h-full max-h-full w-14 flex-col items-center overflow-x-hidden overflow-y-auto rounded-tr-xl border border-b-0 border-l-0 border-chat-border bg-sidebar-accent/30 pt-1">

                {/* Favorites Tab, not a real provider, rendered inline */}
                <button
                  className={`group relative flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl transition-all ease-snappy hover:bg-sidebar-accent/80 ${activeProvider === 'favorites' ? 'bg-sidebar-accent/80' : ''}`}
                  onClick={() => {
                    setActiveProvider("favorites");
                    setSearchQuery("");
                  }}
                  title="Favorites"
                >
                  <div className={`absolute top-1/2 -right-1.5 h-6 w-0.5 translate-x-[0.5px] -translate-y-1/2 rounded-l-full bg-primary transition-opacity duration-150 ${activeProvider === 'favorites' ? 'opacity-100' : 'opacity-0'}`}></div>
                  <Star className="size-5 text-foreground" />
                </button>

                <div className="my-1 h-px w-[calc(100%-1.5rem)] bg-chat-border"></div>

                {/* Provider Tabs, driven entirely by the PROVIDERS registry */}
                {PROVIDERS.map((p) => (
                  <button
                    key={`provider-${p.id}`}
                    className={`group relative flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl transition-all ease-snappy hover:bg-sidebar-accent/80 ${activeProvider === p.id && !searchQuery ? 'bg-sidebar-accent/80' : ''}`}
                    onClick={() => {
                      setActiveProvider(p.id);
                      setSearchQuery("");
                    }}
                    title={p.name}
                  >
                    <div className={`absolute top-1/2 -right-1.5 h-6 w-0.5 translate-x-[0.5px] -translate-y-1/2 rounded-l-full bg-primary transition-opacity duration-150 ${activeProvider === p.id && !searchQuery ? 'opacity-100' : 'opacity-0'}`}></div>
                    <div className="relative">
                      <p.Icon className="size-5 text-muted-foreground opacity-80 transition group-hover:text-foreground group-hover:opacity-100" />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Main Models List */}
            <div className="relative flex-1 overflow-hidden">
              <div className="no-scrollbar h-full overflow-x-hidden overflow-y-auto p-2">
                <div className="space-y-0.5">
                  {displayedModels.length === 0 ? (
                    <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground/60">
                      No models found for this provider.
                    </div>
                  ) : (
                    displayedModels.map((model) => {
                      const provider = getProvider(model.providerId);

                      return (
                        <div
                          key={model.id}
                          role="button"
                          tabIndex={model.disabled ? -1 : 0}
                          aria-disabled={model.disabled || undefined}
                          onClick={() => {
                            if (model.disabled) return;
                            onSelectModel(model.id);
                            setOpen(false);
                          }}
                          onKeyDown={(e) => {
                            if (model.disabled) return;
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onSelectModel(model.id);
                              setOpen(false);
                            }
                          }}
                          onMouseEnter={() => { if (detailModelId) setDetailModelId?.(model.id); }}
                          className={`group flex w-full items-start gap-3 rounded-lg pt-2 pr-1.5 pb-2.5 pl-3 text-left transition-all ease-snappy focus-visible:bg-sidebar-accent/40 focus-visible:ring-2 focus-visible:ring-primary/50 ${
                            model.disabled ? 'cursor-not-allowed opacity-40 hover:bg-transparent' : 'cursor-pointer hover:bg-sidebar-accent/60'
                          } ${selectedModel === model.id ? 'bg-sidebar-accent/80 shadow-sm' : ''}`}
                        >
                          {/* Provider icon (only shown in favorites view or when searching) */}
                          {(activeProvider === "favorites" || searchQuery) && provider && (
                            <span className="mt-0.5 inline-block size-4 shrink-0 text-muted-foreground/80 [&>*]:size-4">
                              <provider.Icon />
                            </span>
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className="text-[13px] truncate font-semibold text-foreground">{model.name}</p>
                              <CostIndicator cost={model.cost} costPlus={model.costPlus} />
                              <div
                                role="button"
                                tabIndex={0}
                                className="z-10 p-0.5 rounded-md transition-all active:scale-125 hover:bg-sidebar-accent/80 cursor-pointer"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  onToggleFavorite(model.id);
                                }}
                              >
                                <Star
                                  className={`size-3.5 transition-all duration-200 ${
                                    favoriteModels.includes(model.id)
                                      ? 'fill-yellow-500 text-yellow-500 scale-110'
                                      : 'text-muted-foreground/30 group-hover:text-muted-foreground/50'
                                  }`}
                                />
                              </div>
                              <div className="flex-1" />
                              <CapabilityDots model={model} />
                              <button
                                className={`ml-0.5 inline-flex items-center justify-center size-5 rounded-full transition-colors ${
                                  detailModelId === model.id
                                    ? 'text-primary bg-primary/10'
                                    : 'text-muted-foreground/30 hover:text-muted-foreground/60 hover:bg-muted/40'
                                }`}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setDetailModelId?.(detailModelId === model.id ? null : model.id);
                                }}
                                type="button"
                              >
                                <Info className="size-3.5" />
                              </button>
                            </div>
                            <p className="text-[11px] text-muted-foreground/60 mt-0.5 truncate">
                              {model.description}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const ModelSelector = forwardRef<ModelSelectorHandle, {
  selectedModel: string;
  onSelectModel: (model: string) => void;
  favoriteModels: string[];
  onToggleFavorite: (model: string) => void;
  isModelLoading?: boolean;
}>(function ModelSelector({
  selectedModel,
  onSelectModel,
  favoriteModels,
  onToggleFavorite,
  isModelLoading = false,
}, ref) {
  const [open, setOpen] = useState(false);
  const [detailModelId, setDetailModelId] = useState<string | null>(null);
  const isMobile = useIsMobile();

  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
  }));
  const [searchQuery, setSearchQuery] = useState("");

  const defaultProvider = useMemo(() => {
    return MODELS.find((m) => m.id === selectedModel)?.providerId || "google";
  }, [selectedModel]);

  const [activeProvider, setActiveProvider] = useState<string>(defaultProvider);

  useEffect(() => {
    if (open) {
      setActiveProvider(MODELS.find((m) => m.id === selectedModel)?.providerId || "google");
      setSearchQuery("");
      setDetailModelId(null);
    }
  }, [open, selectedModel]);

  const activeModel = MODELS.find((m) => m.id === selectedModel) || MODELS[1];

  const sharedProps = {
    selectedModel,
    onSelectModel,
    favoriteModels,
    onToggleFavorite,
    searchQuery,
    setSearchQuery,
    activeProvider,
    setActiveProvider,
    setOpen,
    detailModelId,
    setDetailModelId,
  };

  const detailModel = detailModelId ? MODELS.find(m => m.id === detailModelId) || null : null;

  // Mobile: centered Dialog
  if (isMobile) {
    return (
      <>
        <button
          type="button"
          onClick={() => !isModelLoading && setOpen(true)}
          disabled={isModelLoading}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/40 transition-colors min-w-0"
        >
          {isModelLoading ? (
            <span className="inline-block h-3.5 w-20 animate-pulse rounded bg-muted-foreground/20" />
          ) : (
            <span className="truncate">{activeModel.name}</span>
          )}
          <ChevronDown className="size-4 shrink-0 text-muted-foreground/60" />
        </button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent showCloseButton={false} className="w-[95vw] max-w-[460px] overflow-hidden rounded-xl border-chat-border bg-background/95 p-0 shadow-2xl backdrop-blur-md">
            <DialogTitle className="sr-only">Select Model</DialogTitle>
            <DialogDescription className="sr-only">Choose an AI model</DialogDescription>
            <ModelSelectorContent {...sharedProps} />
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Desktop: Popover
  return (
    <Popover open={isModelLoading ? false : open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={isModelLoading}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/40 transition-colors min-w-0"
        >
          {isModelLoading ? (
            <span className="inline-block h-3.5 w-20 animate-pulse rounded bg-muted-foreground/20" />
          ) : (
            <span className="truncate">{activeModel.name}</span>
          )}
          <ChevronDown className="size-4 shrink-0 text-muted-foreground/60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="relative w-[95vw] sm:w-[460px] max-w-[calc(100vw-1rem)] overflow-visible rounded-xl border border-chat-border bg-background/69 p-0 shadow-2xl backdrop-blur-md z-50"
      >
        <ModelSelectorContent {...sharedProps} />
        {detailModelId && detailModel && (
          <div className="absolute left-full top-0 ml-2 w-[300px] overflow-hidden rounded-xl border border-chat-border bg-background/95 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-left-2 duration-150">
            <ModelDetailPanel model={detailModel} />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
});
