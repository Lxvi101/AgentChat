import { createFileRoute, redirect } from "@tanstack/react-router";
import { SettingsShell } from "~/components/settings/settings-shell";

export const Route = createFileRoute('/settings')({
  beforeLoad: ({ context, location }) => {
    if (!context.isAuthenticated) {
      throw redirect({
        to: '/chat',
      });
    }
  },
  component: SettingsShell,
});
