import { createFileRoute } from "@tanstack/react-router";
import { ChatLayout } from "./chat";

function StudioRoute() {
  return <ChatLayout ssrMode="studio" />;
}

// /studio renders the same ChatLayout in studio mode.
// On hard reload the ssrMode prop ensures the server-rendered HTML is
// correct from the very first paint, no flash of the chat view.
// In-app transitions use nativePushState to keep the component mounted.
// Auth is handled inside the studio via a SignInDialog popup (same as chat).
export const Route = createFileRoute("/studio")({
  component: StudioRoute,
});
