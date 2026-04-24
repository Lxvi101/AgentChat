// src/components/MessageAttachments.tsx
import { useState, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import {
  Paperclip,
  Image as ImageIcon,
  FileText,
  Download,
  Eye,
} from "lucide-react";
import { Skeleton } from "./ui/skeleton";
import { isMarkdownFile, isTextLikeFile } from "~/lib/attachment-context";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";

export type MessageFile = {
  _id: string;
  name: string;
  mimeType: string;
  url?: string | null;
};

export function MessageAttachments({ files }: { files: MessageFile[] }) {
  // 1. Identify which files lack a URL (historical messages loaded from DB)
  const missingUrlIds = files
    .filter((f) => !f.url)
    .map((f) => f._id as Id<"files">);

  // 2. Fetch URLs only for the missing ones.
  // "skip" prevents unnecessary network requests if all URLs are already cached locally.
  const fetchedFiles = useQuery(
    api.files.getFileUrls,
    missingUrlIds.length > 0 ? { fileIds: missingUrlIds } : "skip"
  );

  // 3. Merge the optimistic local files with the securely fetched URLs
  const displayFiles = files.map((f) => {
    if (f.url) return f; // Use local optimistic blob URL
    const remoteFile = fetchedFiles?.find((remote) => remote?._id === f._id);
    return { ...f, url: remoteFile?.url || null }; // Inject remote signed URL
  });

  // Preview state for text files
  const [previewFile, setPreviewFile] = useState<{
    name: string;
    content: string;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const handlePreview = useCallback(
    async (file: MessageFile & { url?: string | null }) => {
      if (!file.url) return;
      setPreviewLoading(true);
      setPreviewFile({ name: file.name, content: "" });
      try {
        const response = await fetch(file.url);
        const text = await response.text();
        setPreviewFile({ name: file.name, content: text });
      } catch (err) {
        console.error("Failed to fetch file content:", err);
        setPreviewFile(null);
      } finally {
        setPreviewLoading(false);
      }
    },
    []
  );

  const handleDownload = useCallback(
    (file: MessageFile & { url?: string | null }) => {
      if (!file.url) return;
      const a = document.createElement("a");
      a.href = file.url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    },
    []
  );

  if (displayFiles.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2 justify-end mb-1">
        {displayFiles.map((f) => {
          const isImage = f.mimeType.startsWith("image/");
          const isTextFile = isTextLikeFile({ name: f.name, type: f.mimeType });

          if (isImage) {
            return (
              <div
                key={f._id}
                className="group/file relative overflow-hidden rounded-xl border border-border shadow-sm"
              >
                {f.url ? (
                  <>
                    <img
                      src={f.url}
                      alt={f.name}
                      className="max-w-[200px] max-h-[200px] object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 flex items-end justify-end p-1.5 opacity-0 transition-opacity group-hover/file:opacity-100 bg-gradient-to-t from-black/40 to-transparent">
                      <button
                        onClick={() => handleDownload(f)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-black/50 text-white hover:bg-black/70 transition-colors backdrop-blur-sm"
                        title="Download"
                      >
                        <Download size={14} />
                      </button>
                    </div>
                  </>
                ) : (
                  // Loading Skeleton while the Convex URL is being fetched
                  <div className="flex w-32 h-32 items-center justify-center bg-muted/40">
                    <ImageIcon className="size-6 text-muted-foreground/30 animate-pulse" />
                  </div>
                )}
              </div>
            );
          }

          if (isTextFile) {
            return (
              <div
                key={f._id}
                className="group/file relative flex min-h-[72px] w-[220px] flex-col justify-between rounded-xl border border-border bg-muted/50 p-3 text-left shadow-sm backdrop-blur-sm"
              >
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
                  <FileText size={12} className="text-muted-foreground/70" />
                  <span>
                    {isMarkdownFile({ name: f.name, type: f.mimeType })
                      ? "Markdown"
                      : "Text file"}
                  </span>
                </div>
                <span className="mt-2 truncate text-sm font-medium text-foreground/85">
                  {f.name}
                </span>
                {f.url && (
                  <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-xl opacity-0 transition-opacity group-hover/file:opacity-100 bg-muted/80 backdrop-blur-[2px]">
                    <button
                      onClick={() => handlePreview(f)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-foreground bg-background border border-border shadow-sm hover:bg-muted transition-colors"
                      title="Preview"
                    >
                      <Eye size={14} />
                      Preview
                    </button>
                    <button
                      onClick={() => handleDownload(f)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-foreground bg-background border border-border shadow-sm hover:bg-muted transition-colors"
                      title="Download"
                    >
                      <Download size={14} />
                    </button>
                  </div>
                )}
              </div>
            );
          }

          // Non-Image Attachment Fallback
          return (
            <div
              key={f._id}
              className="group/file relative flex items-center gap-2 bg-muted/60 border border-border px-3 py-2 rounded-xl text-sm shadow-sm backdrop-blur-sm"
            >
              <Paperclip size={14} className="text-muted-foreground shrink-0" />
              <span className="truncate max-w-[200px] font-medium text-foreground/80">
                {f.name}
              </span>
              {f.url && (
                <button
                  onClick={() => handleDownload(f)}
                  className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/file:opacity-100 hover:bg-muted hover:text-foreground"
                  title="Download"
                >
                  <Download size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Text file preview dialog */}
      <Dialog
        open={previewFile !== null}
        onOpenChange={(open) => !open && setPreviewFile(null)}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-medium">
              <FileText size={16} />
              {previewFile?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto rounded-lg border border-border bg-muted/30 p-4">
            {previewLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-[80%]" />
                <Skeleton className="h-4 w-[60%]" />
              </div>
            ) : (
              <pre className="whitespace-pre-wrap text-sm font-mono text-foreground/90 leading-relaxed">
                {previewFile?.content}
              </pre>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
