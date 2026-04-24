import {
  registerTranscriptionProvider,
  type TranscriptionRequest,
  type TranscriptionResult,
} from "../transcription";

const FIREWORKS_WHISPER_ENDPOINT =
  "https://audio-turbo.api.fireworks.ai/v1/audio/transcriptions";

// Fix: Use the exact model name expected by their audio API
const FIREWORKS_WHISPER_MODEL = "whisper-v3-turbo";

registerTranscriptionProvider({
  id: "fireworks-whisper",
  name: "Fireworks Whisper v3 Turbo",

  async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
    const apiKey = process.env.FIREWORK_API_KEY;
    if (!apiKey) throw new Error("FIREWORK_API_KEY is not configured");

    const ext = request.mimeType.includes("webm")
      ? "webm"
      : request.mimeType.includes("mp4")
        ? "mp4"
        : request.mimeType.includes("ogg")
          ? "ogg"
          : "webm";

    const formData = new FormData();
    // Fix: Instead of instantiating `new File()`, we can just append the Blob
    // directly and provide the filename as the 3rd argument.
    // This perfectly bypasses the base64 object stringification bug!
    formData.append("file", request.audioBlob, `recording.${ext}`);
    formData.append("model", FIREWORKS_WHISPER_MODEL);
    formData.append("temperature", "0");
    formData.append("vad_model", "silero");
    formData.append("response_format", "json");
    if (request.language) {
      formData.append("language", request.language);
    }

    const response = await fetch(FIREWORKS_WHISPER_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Fireworks transcription failed (${response.status}): ${errorText}`
      );
    }

    const data = await response.json();

    return {
      text: data.text?.trim() ?? "",
      durationSeconds: data.duration,
    };
  },
});
