import { createFileRoute } from "@tanstack/react-router";
import { Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  SettingsBadge,
  SettingsPanel,
  SettingsSectionHeader,
  SettingsToggle,
} from "~/components/settings/settings-primitives";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/settings/customization")({
  component: CustomizationSettings,
});

function CustomizationSettings() {
  const profile = useQuery(api.users.getProfile);
  const updatePrefs = useMutation(api.users.updatePreferences).withOptimisticUpdate(
    (localStore, args) => {
      const currentProfile = localStore.getQuery(api.users.getProfile, {});
      if (!currentProfile) return;
      localStore.setQuery(api.users.getProfile, {}, {
        ...currentProfile,
        autoFollowStream:
          args.autoFollowStream !== undefined ? args.autoFollowStream : currentProfile.autoFollowStream,
      });
    },
  );

  const [compactMode, setCompactMode] = useState(false);
  const autoFollowStream = profile?.autoFollowStream ?? true;

  return (
    <div className="space-y-5">
      <SettingsSectionHeader
        title="Customization"
        description="Personalize your chat experience and interface."
      />

      <div className="grid gap-3 lg:grid-cols-3">
        {[
          { label: "System", icon: Monitor, active: true },
          { label: "Light", icon: Sun },
          { label: "Dark", icon: Moon },
        ].map((option) => {
          const Icon = option.icon;
          return (
            <SettingsPanel
              key={option.label}
              className={cn(
                "flex items-center gap-3 transition-transform duration-200 hover:-translate-y-0.5",
                option.active && "border-[#dfb4c4] bg-[#fff7fa]",
              )}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#f4eee8] text-zinc-700">
                <Icon className="h-4 w-4" />
              </div>
              <div className="space-y-1">
                <div className="text-[13.5px] font-semibold tracking-[-0.01em] text-zinc-900">
                  {option.label}
                </div>
                {option.active ? <SettingsBadge>Active</SettingsBadge> : null}
              </div>
            </SettingsPanel>
          );
        })}
      </div>

      <SettingsPanel className="space-y-3.5">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <div className="text-[13px] font-semibold tracking-[-0.01em] text-zinc-900">
              Compact mode
            </div>
            <p className="text-[12.5px] leading-[1.5] text-zinc-500">
              Reduce spacing in the sidebar and message list.
            </p>
          </div>
          <SettingsToggle checked={compactMode} onCheckedChange={setCompactMode} />
        </div>
        <div className="h-px bg-zinc-100" />
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <div className="text-[13px] font-semibold tracking-[-0.01em] text-zinc-900">
              Auto-follow responses
            </div>
            <p className="text-[12.5px] leading-[1.5] text-zinc-500">
              Automatically scroll to follow AI responses as they generate.
            </p>
          </div>
          <SettingsToggle checked={autoFollowStream} onCheckedChange={(checked) => updatePrefs({ autoFollowStream: checked })} />
        </div>
      </SettingsPanel>
    </div>
  );
}
