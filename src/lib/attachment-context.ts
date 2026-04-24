import { estimateTokenCount } from "tokenx";

const TEXT_FILE_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "mdx",
  "json",
  "js",
  "jsx",
  "ts",
  "tsx",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "kt",
  "swift",
  "css",
  "scss",
  "html",
  "xml",
  "yaml",
  "yml",
  "toml",
  "ini",
  "csv",
  "sql",
  "sh",
  "bash",
]);

const MARKDOWN_FILE_EXTENSIONS = new Set(["md", "markdown", "mdx"]);

const CLIPBOARD_ATTACHMENT_TOKEN_THRESHOLD = 450;
const CLIPBOARD_ATTACHMENT_CHAR_THRESHOLD = 1_800;
const CLIPBOARD_ATTACHMENT_LINE_THRESHOLD = 18;

export interface AttachmentContextEstimate {
  kind: "text" | "image" | "binary";
  contextTokens: number;
  isApproximate: boolean;
  previewText?: string;
  previewLabel?: string;
  dimensions?: {
    width: number;
    height: number;
  };
}

function getFileExtension(fileName: string) {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? parts.at(-1) ?? "" : "";
}

export function isMarkdownFile(file: Pick<File, "name" | "type">) {
  return file.type === "text/markdown" || MARKDOWN_FILE_EXTENSIONS.has(getFileExtension(file.name));
}

export function isTextLikeFile(file: Pick<File, "name" | "type">) {
  if (file.type.startsWith("text/")) return true;
  if (file.type === "application/json") return true;
  return TEXT_FILE_EXTENSIONS.has(getFileExtension(file.name));
}

export function isContextEstimableFile(file: Pick<File, "name" | "type">) {
  return isTextLikeFile(file) || file.type.startsWith("image/");
}

export function formatCompactContextSize(tokens: number, approximate = false) {
  let formatted: string;

  if (tokens >= 1_000_000) {
    formatted = `${(tokens / 1_000_000).toFixed(tokens >= 10_000_000 ? 0 : 1)}M`;
  } else if (tokens >= 1_000) {
    formatted = `${(tokens / 1_000).toFixed(tokens >= 10_000 ? 0 : 1)}k`;
  } else {
    formatted = `${tokens}`;
  }

  return approximate ? `~${formatted}` : formatted;
}

function buildAttachedFileEnvelope(fileName: string, text: string) {
  return `\n\n--- ATTACHED FILE: ${fileName} ---\n${text}\n--- END ATTACHED FILE ---`;
}

function buildPreviewText(text: string) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return "Empty file";

  const previewLines = normalized
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .slice(0, 4);

  const preview = previewLines.join("\n");
  return preview.length > 240 ? `${preview.slice(0, 237)}...` : preview;
}

function buildTextPreviewLabel(file: Pick<File, "name" | "type">) {
  if (isMarkdownFile(file)) return "Markdown";
  if (file.type === "application/json" || getFileExtension(file.name) === "json") return "JSON";
  if (getFileExtension(file.name) === "csv") return "CSV";
  return "Text";
}

function approximateImageTokens(width: number, height: number) {
  const boundedWidth = Math.max(1, Math.min(width, 2_048));
  const boundedHeight = Math.max(1, Math.min(height, 2_048));
  const tileCount = Math.ceil(boundedWidth / 768) * Math.ceil(boundedHeight / 768);
  return 256 + tileCount * 192;
}

function approximateImageTokensFromSize(fileSize: number) {
  const estimatedMegapixels = Math.max(0.5, Math.min(6, fileSize / 350_000));
  const squareDimension = Math.sqrt(estimatedMegapixels * 1_000_000);
  return approximateImageTokens(squareDimension, squareDimension);
}

async function getImageDimensions(file: File) {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    return await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("Failed to read image dimensions"));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function estimateAttachmentContext(file: File): Promise<AttachmentContextEstimate> {
  if (isTextLikeFile(file)) {
    const text = await file.text();

    return {
      kind: "text",
      contextTokens: estimateTokenCount(buildAttachedFileEnvelope(file.name, text)),
      isApproximate: false,
      previewText: buildPreviewText(text),
      previewLabel: buildTextPreviewLabel(file),
    };
  }

  if (file.type.startsWith("image/")) {
    try {
      const dimensions = await getImageDimensions(file);
      return {
        kind: "image",
        contextTokens: approximateImageTokens(dimensions.width, dimensions.height),
        isApproximate: true,
        previewLabel: "Image",
        dimensions,
      };
    } catch (error) {
      console.error("Failed to estimate image context from dimensions:", error);
      return {
        kind: "image",
        contextTokens: approximateImageTokensFromSize(file.size),
        isApproximate: true,
        previewLabel: "Image",
      };
    }
  }

  return {
    kind: "binary",
    contextTokens: 0,
    isApproximate: true,
  };
}

function looksLikeMarkdown(text: string) {
  return /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|> )/.test(text) || /```|`[^`]+`|\[[^\]]+\]\([^)]+\)/.test(text);
}

export function shouldConvertClipboardToAttachment(text: string) {
  const normalized = text.trim();
  if (!normalized) return false;

  const lineCount = normalized.split("\n").length;
  return (
    normalized.length >= CLIPBOARD_ATTACHMENT_CHAR_THRESHOLD ||
    lineCount >= CLIPBOARD_ATTACHMENT_LINE_THRESHOLD ||
    estimateTokenCount(normalized) >= CLIPBOARD_ATTACHMENT_TOKEN_THRESHOLD
  );
}

export function createClipboardAttachmentFile(text: string) {
  const asMarkdown = looksLikeMarkdown(text);
  const extension = asMarkdown ? "md" : "txt";
  const mimeType = asMarkdown ? "text/markdown" : "text/plain";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  return new File([text], `clipboard-${timestamp}.${extension}`, {
    type: mimeType,
  });
}
