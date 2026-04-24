import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
  ChevronDown,
  Ellipsis,
  Grid2x2,
  List,
  Search,
  Sparkles,
  Star,
} from "lucide-react";
import type { ReactNode } from "react";
import { startTransition, useDeferredValue, useMemo, useState } from "react";
import {
  SettingsBadge,
  SettingsPanel,
  SettingsSectionHeader,
} from "~/components/settings/settings-primitives";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { api } from "../../../convex/_generated/api";
import { MODELS, type ProviderId } from "~/lib/models";
import { getProvider } from "~/lib/providers";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/settings/models")({
  component: ModelsSettings,
});

const filters = [
  { id: "all", label: "All models" },
  { id: "favorites", label: "Favorites" },
  { id: "vision", label: "Image support" },
  { id: "audio", label: "Audio support" },
  { id: "disabled", label: "Unavailable" },
] as const;

type ModelFilter = (typeof filters)[number]["id"];

function ModelsSettings() {
  const profile = useQuery(api.users.getProfile);
  const updatePrefs = useMutation(api.users.updatePreferences).withOptimisticUpdate(
    (localStore, args) => {
      const currentProfile = localStore.getQuery(api.users.getProfile, {});
      if (!currentProfile) return;

      localStore.setQuery(api.users.getProfile, {}, {
        ...currentProfile,
        favoriteModels:
          args.favoriteModels !== undefined
            ? args.favoriteModels
            : currentProfile.favoriteModels,
      });
    },
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");
  const [filter, setFilter] = useState<ModelFilter>("all");
  const deferredQuery = useDeferredValue(searchQuery);

  const favoriteModels = profile?.favoriteModels ?? [];
  const newModels = useMemo(() => MODELS.filter((model) => !model.disabled).slice(0, 3), []);

  const filteredModels = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();

    return MODELS.filter((model) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        model.name.toLowerCase().includes(normalizedQuery) ||
        model.description.toLowerCase().includes(normalizedQuery) ||
        model.providerId.toLowerCase().includes(normalizedQuery);

      const matchesFilter =
        filter === "all" ||
        (filter === "favorites" && favoriteModels.includes(model.id)) ||
        (filter === "vision" && model.supportsImages) ||
        (filter === "audio" && model.supportsAudio) ||
        (filter === "disabled" && model.disabled);

      return matchesQuery && matchesFilter;
    });
  }, [deferredQuery, favoriteModels, filter]);

  const selectedFilter = filters.find((item) => item.id === filter);

  const handleFavoriteToggle = (modelId: string) => {
    const nextFavorites = favoriteModels.includes(modelId)
      ? favoriteModels.filter((id) => id !== modelId)
      : [...favoriteModels, modelId];

    updatePrefs({ favoriteModels: nextFavorites });
  };

  return (
    <div className="space-y-3.5">
      <SettingsSectionHeader
        title="Models"
        description="Choose which models appear in your selector, and read more about their capabilities."
        action={
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-zinc-200 bg-white text-zinc-600 shadow-[0_2px_8px_rgba(0,0,0,0.035)] transition-all duration-200 hover:-translate-y-0.5 hover:text-zinc-900"
            aria-label="More model options"
          >
            <Ellipsis className="h-4 w-4" />
          </button>
        }
      />

      <SettingsPanel className="flex items-center gap-2.5 rounded-[12px] border-zinc-200 bg-zinc-100 px-3 py-2 text-[12px] text-zinc-700 shadow-none">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-zinc-700" />
        <span className="font-semibold text-zinc-900">{newModels.length} new</span>
        <span className="text-zinc-500">{newModels.map((model) => model.name).join(", ")}</span>
      </SettingsPanel>

      <div className="flex flex-col gap-2.5 lg:flex-row">
        <label className="flex h-9 flex-1 items-center gap-2.5 rounded-[11px] border border-zinc-200 bg-white px-3 shadow-[0_2px_8px_rgba(0,0,0,0.035)]">
          <Search className="h-3.5 w-3.5 text-zinc-400" />
          <input
            value={searchQuery}
            onChange={(event) =>
              startTransition(() => {
                setSearchQuery(event.target.value);
              })
            }
            placeholder="Search models..."
            className="h-full w-full bg-transparent text-[16px] sm:text-[13px] text-zinc-800 outline-none placeholder:text-zinc-400"
          />
        </label>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-9 items-center gap-2 rounded-[11px] border border-zinc-200 bg-white px-3 text-[12.5px] font-medium text-zinc-700 shadow-[0_2px_8px_rgba(0,0,0,0.035)] transition-all duration-200 hover:-translate-y-0.5 hover:text-zinc-900"
              >
                <Search className="h-3.5 w-3.5" />
                {selectedFilter?.label}
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {filters.map((item) => (
                <DropdownMenuItem key={item.id} onClick={() => setFilter(item.id)}>
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="inline-flex rounded-[11px] border border-zinc-200 bg-white p-0.5 shadow-[0_2px_8px_rgba(0,0,0,0.035)]">
            <ViewToggleButton
              active={view === "list"}
              onClick={() => setView("list")}
              ariaLabel="List view"
            >
              <List className="h-3.5 w-3.5" />
            </ViewToggleButton>
            <ViewToggleButton
              active={view === "grid"}
              onClick={() => setView("grid")}
              ariaLabel="Grid view"
            >
              <Grid2x2 className="h-3.5 w-3.5" />
            </ViewToggleButton>
          </div>
        </div>
      </div>

      {view === "list" ? (
        <SettingsPanel className="overflow-hidden p-0">
          <div className="divide-y divide-black/[0.06]">
            {filteredModels.map((model) => (
              <div
                key={model.id}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors duration-200 hover:bg-zinc-50",
                  model.disabled && "opacity-55",
                )}
              >
                <ProviderIcon providerId={model.providerId} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold tracking-[-0.01em] text-zinc-900">
                      {model.name}
                    </span>
                    <span className="text-[11px] font-semibold text-zinc-500">
                      {"$".repeat(model.cost)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[12px] text-zinc-500">{model.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleFavoriteToggle(model.id)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-zinc-300 transition-colors duration-200 hover:bg-zinc-100 hover:text-zinc-900"
                  aria-label={
                    favoriteModels.includes(model.id)
                      ? `Remove ${model.name} from favorites`
                      : `Add ${model.name} to favorites`
                  }
                  >
                    <Star
                      className={cn(
                        "h-4 w-4",
                        favoriteModels.includes(model.id) && "fill-zinc-900 text-zinc-900",
                      )}
                    />
                </button>
              </div>
            ))}
          </div>
        </SettingsPanel>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredModels.map((model) => (
            <div
              key={model.id}
              className={cn(
                "rounded-[14px] transition-transform duration-200 hover:-translate-y-0.5",
                model.disabled && "opacity-55",
              )}
            >
              <SettingsPanel className="flex h-full flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <ProviderIcon providerId={model.providerId} />
                  <button
                    type="button"
                    onClick={() => handleFavoriteToggle(model.id)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] text-zinc-300 transition-colors duration-200 hover:bg-zinc-100 hover:text-zinc-900"
                    aria-label={`Toggle favorite for ${model.name}`}
                  >
                    <Star
                      className={cn(
                        "h-4 w-4",
                        favoriteModels.includes(model.id) && "fill-zinc-900 text-zinc-900",
                      )}
                    />
                  </button>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[13.5px] font-semibold tracking-[-0.01em] text-zinc-900">
                      {model.name}
                    </h3>
                    <span className="text-[11px] font-semibold text-zinc-500">
                      {"$".repeat(model.cost)}
                    </span>
                  </div>
                  <p className="text-[12px] leading-[1.5] text-zinc-500">{model.description}</p>
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-1.5">
                  {model.supportsImages ? <SettingsBadge>Vision</SettingsBadge> : null}
                  {model.supportsAudio ? <SettingsBadge>Audio</SettingsBadge> : null}
                </div>
              </SettingsPanel>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ViewToggleButton({
  active,
  onClick,
  ariaLabel,
  children,
}: {
  active: boolean;
  onClick: () => void;
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-[8px] text-zinc-500 transition-all duration-200",
        active && "bg-zinc-100 text-zinc-900 shadow-[0_2px_6px_rgba(0,0,0,0.04)]",
      )}
    >
      {children}
    </button>
  );
}

function ProviderIcon({ providerId }: { providerId: ProviderId }) {
  // Icon resolved from the shared PROVIDERS registry, no local mapping to
  // keep in sync. Adding a new provider in `src/lib/providers.tsx` lights it
  // up here automatically.
  const provider = getProvider(providerId);
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-zinc-100 text-zinc-700">
      {provider && <provider.Icon className="h-3.5 w-3.5" />}
    </div>
  );
}
