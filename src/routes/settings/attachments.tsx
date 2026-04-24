import { createFileRoute } from "@tanstack/react-router";
import { FileStack, FolderArchive } from "lucide-react";
import {
  SettingsBadge,
  SettingsPanel,
  SettingsSectionHeader,
} from "~/components/settings/settings-primitives";

export const Route = createFileRoute("/settings/attachments")({
  component: AttachmentsSettings,
});

function AttachmentsSettings() {
  return (
    <div className="space-y-5">
      <SettingsSectionHeader
        title="Attachments"
        description="Manage your uploaded files and attachments."
      />
      <div className="grid gap-3 lg:grid-cols-2">
        <SettingsPanel className="space-y-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#f4eee8] text-zinc-700">
            <FolderArchive className="h-4 w-4" />
          </div>
          <div className="space-y-1">
            <div className="text-[13px] font-semibold tracking-[-0.01em] text-zinc-900">
              Storage usage
            </div>
            <p className="text-[12.5px] leading-[1.55] text-zinc-500">
              Uploaded files will appear here with storage totals and retention controls.
            </p>
          </div>
          <SettingsBadge>0 files indexed</SettingsBadge>
        </SettingsPanel>
        <SettingsPanel className="space-y-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#f4eee8] text-zinc-700">
            <FileStack className="h-4 w-4" />
          </div>
          <div className="space-y-1">
            <div className="text-[13px] font-semibold tracking-[-0.01em] text-zinc-900">
              Supported types
            </div>
            <p className="text-[12.5px] leading-[1.55] text-zinc-500">
              Documents, code files, images, and audio clips are ready for upload handling.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["PDF", "PNG", "MP3", "TS", "CSV"].map((type) => (
              <SettingsBadge key={type}>{type}</SettingsBadge>
            ))}
          </div>
        </SettingsPanel>
      </div>
    </div>
  );
}
