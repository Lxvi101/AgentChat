import { useState, useRef, useCallback, useEffect } from "react";

export type VoiceRecorderState =
  | "idle"
  | "requesting-permission"
  | "recording"
  | "transcribing"
  | "error";

export interface VoiceRecorderError {
  type:
    | "permission-denied"
    | "not-supported"
    | "recording-failed"
    | "recording-too-short"
    | "transcription-failed";
  message: string;
}

export interface UseVoiceRecorderReturn {
  state: VoiceRecorderState;
  startRecording: () => Promise<void>;
  stopAndTranscribe: () => Promise<string | null>;
  cancelRecording: () => void;
  retryTranscription: () => Promise<string | null>;
  downloadAudio: () => void;
  duration: number;
  error: VoiceRecorderError | null;
  reset: () => void;
}

export function useVoiceRecorder(): UseVoiceRecorderReturn {
  const [state, setState] = useState<VoiceRecorderState>("idle");
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<VoiceRecorderError | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioBlobRef = useRef<Blob | null>(null);
  const mimeTypeRef = useRef<string>("audio/webm;codecs=opus");
  const streamRef = useRef<MediaStream | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const cleanup = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  const startRecording = useCallback(async () => {
    try {
      setState("requesting-permission");
      setError(null);
      audioChunksRef.current = [];
      audioBlobRef.current = null;

      if (!navigator.mediaDevices?.getUserMedia) {
        throw {
          type: "not-supported" as const,
          message: "Your browser does not support audio recording.",
        };
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      const preferredTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ];
      const mimeType =
        preferredTypes.find((t) => MediaRecorder.isTypeSupported(t)) ||
        "audio/webm";
      mimeTypeRef.current = mimeType;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000,
      });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onerror = () => {
        setError({
          type: "recording-failed",
          message: "Recording failed unexpectedly.",
        });
        setState("error");
        cleanup();
      };

      mediaRecorder.start(250);

      startTimeRef.current = Date.now();
      setDuration(0);
      durationIntervalRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 200);

      setState("recording");
    } catch (err: any) {
      cleanup();
      if (err?.type) {
        setError(err);
      } else if (
        err?.name === "NotAllowedError" ||
        err?.name === "PermissionDeniedError"
      ) {
        setError({
          type: "permission-denied",
          message:
            "Microphone access was denied. Please allow microphone access in your browser settings.",
        });
      } else {
        setError({
          type: "recording-failed",
          message: err?.message || "Failed to start recording.",
        });
      }
      setState("error");
    }
  }, [cleanup]);

  const buildAudioBlob = useCallback((): Promise<Blob> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        const blob = new Blob(audioChunksRef.current, {
          type: mimeTypeRef.current,
        });
        audioBlobRef.current = blob;
        resolve(blob);
        return;
      }

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, {
          type: mimeTypeRef.current,
        });
        audioBlobRef.current = blob;
        resolve(blob);
      };

      recorder.stop();
    });
  }, []);

  const sendForTranscription = useCallback(
    async (blob: Blob): Promise<string> => {
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");
      formData.append("mimeType", mimeTypeRef.current);

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(data.error || `Server error ${response.status}`);
      }

      const data = await response.json();
      return data.text;
    },
    []
  );

  const stopAndTranscribe = useCallback(async (): Promise<string | null> => {
    try {
      const blob = await buildAudioBlob();
      cleanup();

      if (!blob || blob.size < 1024) {
        audioBlobRef.current = null;
        setError({
          type: "recording-too-short",
          message:
            "Recording too short. Please record for at least 1 second and try again.",
        });
        setState("error");
        return null;
      }

      setState("transcribing");

      const text = await sendForTranscription(blob);
      const trimmed = typeof text === "string" ? text.trim() : "";

      if (!trimmed) {
        setError({
          type: "transcription-failed",
          message:
            "No speech detected. Try speaking closer to the mic or check your microphone.",
        });
        setState("error");
        return null;
      }

      setState("idle");
      setDuration(0);
      return trimmed;
    } catch (err: any) {
      setError({
        type: "transcription-failed",
        message:
          err?.message ||
          "Transcription failed. You can retry or download the audio.",
      });
      setState("error");
      return null;
    }
  }, [buildAudioBlob, cleanup, sendForTranscription]);

  const cancelRecording = useCallback(() => {
    cleanup();
    audioChunksRef.current = [];
    audioBlobRef.current = null;
    setState("idle");
    setDuration(0);
    setError(null);
  }, [cleanup]);

  const retryTranscription = useCallback(async (): Promise<string | null> => {
    const blob = audioBlobRef.current;
    if (!blob) {
      setError({
        type: "transcription-failed",
        message: "No audio recording available to retry.",
      });
      return null;
    }
    try {
      setState("transcribing");
      setError(null);
      const text = await sendForTranscription(blob);
      setState("idle");
      setDuration(0);
      return text;
    } catch (err: any) {
      setError({
        type: "transcription-failed",
        message: err?.message || "Retry failed. You can download the audio file.",
      });
      setState("error");
      return null;
    }
  }, [sendForTranscription]);

  const downloadAudio = useCallback(() => {
    const blob = audioBlobRef.current;
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `voice-recording-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const reset = useCallback(() => {
    cleanup();
    audioChunksRef.current = [];
    audioBlobRef.current = null;
    setState("idle");
    setDuration(0);
    setError(null);
  }, [cleanup]);

  return {
    state,
    startRecording,
    stopAndTranscribe,
    cancelRecording,
    retryTranscription,
    downloadAudio,
    duration,
    error,
    reset,
  };
}
