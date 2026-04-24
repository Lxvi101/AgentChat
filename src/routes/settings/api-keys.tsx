import { createFileRoute } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";
import {
  SettingsBadge,
  SettingsPanel,
  SettingsSectionHeader,
} from "~/components/settings/settings-primitives";

export const Route = createFileRoute("/settings/api-keys")({
  component: ApiKeysSettings,
});

function ApiKeysSettings() {
  return (
    <div className="space-y-5">
      <SettingsSectionHeader
        title="API Keys"
        description="Manage your API keys for external services."
      />
      <SettingsPanel className="flex items-start gap-3.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#f4eee8] text-zinc-700">
          <KeyRound className="h-4 w-4" />
        </div>
        <div className="space-y-2">
          <div className="text-[13px] font-semibold tracking-[-0.01em] text-zinc-900">
            Provider keys are not configured yet
          </div>
          <p className="max-w-2xl text-[12.5px] leading-[1.55] text-zinc-500">
            When external provider integrations are enabled, your keys and scopes will show up
            here with rotation and revoke controls.
          </p>
          <SettingsBadge>Coming soon</SettingsBadge>
        </div>
      </SettingsPanel>
    </div>
  );
}
