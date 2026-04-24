export interface TranscriptionRequest {
  audioBlob: Blob;
  mimeType: string;
  language?: string;
}

export interface TranscriptionResult {
  text: string;
  durationSeconds?: number;
}

export interface TranscriptionProvider {
  id: string;
  name: string;
  transcribe(request: TranscriptionRequest): Promise<TranscriptionResult>;
}

const providers: Record<string, TranscriptionProvider> = {};

export function registerTranscriptionProvider(provider: TranscriptionProvider) {
  providers[provider.id] = provider;
}

export function getTranscriptionProvider(id: string): TranscriptionProvider {
  const provider = providers[id];
  if (!provider) {
    throw new Error(
      `No transcription provider registered for "${id}". Available: ${Object.keys(providers).join(", ")}`
    );
  }
  return provider;
}

export const DEFAULT_TRANSCRIPTION_PROVIDER =
  process.env.TRANSCRIPTION_PROVIDER || "fireworks-whisper";
