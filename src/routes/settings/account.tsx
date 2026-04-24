import { createFileRoute } from "@tanstack/react-router";
import {
  SettingsButton,
  SettingsPanel,
  SettingsSectionHeader,
} from "~/components/settings/settings-primitives";

export const Route = createFileRoute("/settings/account")({
  component: AccountSettings,
});

function AccountSettings() {
  return (
    <div className="space-y-5">
      <SettingsSectionHeader title="Account" />

      <section className="space-y-3">
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
          Security Options
        </h3>
        <SettingsPanel className="space-y-3.5">
          <div className="space-y-1">
            <div className="text-[13px] font-semibold tracking-[-0.01em] text-zinc-900">
              Devices
            </div>
            <p className="max-w-2xl text-[12.5px] leading-[1.55] text-zinc-500">
              Manage and sign out from other devices that are currently logged in to your
              account.
            </p>
          </div>
          <SettingsButton type="button" variant="secondary" className="w-fit">
            View Devices
          </SettingsButton>
        </SettingsPanel>
      </section>

      <section className="space-y-3">
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
          Danger Zone
        </h3>
        <SettingsPanel className="space-y-3.5 border-zinc-200 bg-zinc-50">
          <div className="space-y-1">
            <div className="text-[13px] font-semibold tracking-[-0.01em] text-zinc-900">
              Deactivate account
            </div>
            <p className="max-w-2xl text-[12.5px] leading-[1.55] text-zinc-500">
              Remove access on this device and submit an account deletion request to support.
            </p>
          </div>
          <SettingsButton type="button" variant="destructive" className="w-fit">
            Request Account Deletion
          </SettingsButton>
        </SettingsPanel>
      </section>
    </div>
  );
}
