import { createFileRoute } from "@tanstack/react-router";
import { LifeBuoy, Mail, MessageSquareText } from "lucide-react";
import { SettingsPanel, SettingsSectionHeader } from "~/components/settings/settings-primitives";

export const Route = createFileRoute("/settings/contact")({
  component: ContactSettings,
});

function ContactSettings() {
  return (
    <div className="space-y-5">
      <SettingsSectionHeader
        title="Contact Us"
        description="Get in touch with our support team."
      />
      <div className="grid gap-3 lg:grid-cols-3">
        {[
          {
            icon: Mail,
            title: "Email support",
            description: "Reach the team for billing, account, or technical issues.",
          },
          {
            icon: MessageSquareText,
            title: "Product feedback",
            description: "Send UI issues, missing features, and workflow requests.",
          },
          {
            icon: LifeBuoy,
            title: "Priority help",
            description: "Need help fast? Route urgent issues through our priority support channel.",
          },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <SettingsPanel key={item.title} className="space-y-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#f4eee8] text-zinc-700">
                <Icon className="h-4 w-4" />
              </div>
              <div className="space-y-1">
                <div className="text-[13px] font-semibold tracking-[-0.01em] text-zinc-900">
                  {item.title}
                </div>
                <p className="text-[12.5px] leading-[1.55] text-zinc-500">{item.description}</p>
              </div>
            </SettingsPanel>
          );
        })}
      </div>
    </div>
  );
}
