/**
 * Distill errors thrown by the AI SDK (or any upstream source) into a short,
 * human-readable message suitable for display in chat. We purposely avoid
 * leaking raw stack traces or provider debug blobs, the user only needs
 * to know what went wrong and how to recover.
 */

const MAX_LEN = 400;

function truncate(text: string, max = MAX_LEN): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}

function describeStatus(status: number | undefined): string | null {
  if (!status) return null;
  if (status === 400) return "The model rejected the request (bad request).";
  if (status === 401) return "Authentication with the model provider failed.";
  if (status === 402) return "The model provider requires payment for this request.";
  if (status === 403) return "The model provider refused the request.";
  if (status === 404) return "The requested model could not be found on the provider.";
  if (status === 408) return "The model provider timed out.";
  if (status === 413) return "The request is too large for this model.";
  if (status === 422) return "The model rejected the request (invalid input).";
  if (status === 429) return "Rate limited by the model provider. Please try again in a moment.";
  if (status >= 500 && status < 600) return "The model provider is currently unavailable.";
  return null;
}

export function formatStreamError(err: unknown): string {
  if (err == null) return "The model provider returned an error.";

  // AbortErrors shouldn't surface as errors, caller should have already
  // filtered them out, but guard just in case.
  if (err instanceof Error && err.name === "AbortError") {
    return "Generation was stopped.";
  }

  const anyErr = err as any;
  const status: number | undefined =
    typeof anyErr?.statusCode === "number" ? anyErr.statusCode :
    typeof anyErr?.status === "number" ? anyErr.status :
    undefined;

  const statusBlurb = describeStatus(status);

  // Vercel AI SDK errors carry the upstream response body on `.responseBody`.
  // When present, try to extract a useful message.
  let providerMessage: string | null = null;
  const responseBody = anyErr?.responseBody;
  if (typeof responseBody === "string" && responseBody.trim()) {
    try {
      const parsed = JSON.parse(responseBody);
      const candidate =
        parsed?.error?.message ??
        parsed?.message ??
        parsed?.error ??
        null;
      if (typeof candidate === "string" && candidate.trim()) {
        providerMessage = candidate.trim();
      }
    } catch {
      // Not JSON, use first ~200 chars if it looks like plain text
      if (responseBody.length < 500 && !/[<>]/.test(responseBody)) {
        providerMessage = responseBody.trim();
      }
    }
  }

  const baseMessage = err instanceof Error ? err.message : String(err);

  if (statusBlurb && providerMessage) {
    return truncate(`${statusBlurb} (${providerMessage})`);
  }
  if (statusBlurb) {
    return truncate(statusBlurb);
  }
  if (providerMessage) {
    return truncate(providerMessage);
  }
  if (baseMessage && baseMessage !== "Not Found") {
    return truncate(baseMessage);
  }
  if (status) {
    return truncate(`The model provider returned an error (HTTP ${status}).`);
  }
  return "The model provider returned an unknown error.";
}
