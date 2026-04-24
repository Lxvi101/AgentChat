import { createFileRoute } from "@tanstack/react-router";
import { getToken } from "~/lib/auth-server";
import {
  getTranscriptionProvider,
  DEFAULT_TRANSCRIPTION_PROVIDER,
} from "~/lib/transcription";
import "~/lib/transcription-providers/fireworks-whisper";

export const Route = createFileRoute("/api/transcribe/")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = await getToken();
        if (!token) return new Response("Unauthorized", { status: 401 });

        try {
          const formData = await request.formData();
          const audioFile = formData.get("audio") as File | null;
          const mimeType = formData.get("mimeType") as string | null;
          const language = formData.get("language") as string | null;
          const providerId =
            (formData.get("provider") as string | null) ||
            DEFAULT_TRANSCRIPTION_PROVIDER;

          if (!audioFile) {
            return Response.json(
              { error: "No audio file provided" },
              { status: 400 }
            );
          }

          const provider = getTranscriptionProvider(providerId);
          const audioBlob = new Blob([await audioFile.arrayBuffer()], {
            type: mimeType || audioFile.type || "audio/webm",
          });

          const result = await provider.transcribe({
            audioBlob,
            mimeType: mimeType || audioFile.type || "audio/webm",
            language: language || undefined,
          });

          return Response.json({
            text: result.text,
            durationSeconds: result.durationSeconds,
          });
        } catch (error) {
          console.error("Transcription error:", error);
          return Response.json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Transcription failed",
            },
            { status: 500 }
          );
        }
      },
    },
  },
});
