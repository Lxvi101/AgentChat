import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Paperclip } from "lucide-react";

export type MessageFile = {
  _id: string;
  name: string;
  mimeType: string;
  url?: string | null;
};

/**
 * Renders message attachments. For files with blob URLs (optimistic), renders immediately.
 * For files from the server (no URL), fetches signed URLs via getFileUrls.
 */
export function MessageFilePreview({ files }: { files: MessageFile[] }) {
  const filesNeedingUrl = files.filter((f) => !f.url);
  const fileIds = filesNeedingUrl.map((f) => f._id as Id<"files">);

  const urlsResult = useQuery(
    api.files.getFileUrls,
    fileIds.length > 0 ? { fileIds } : "skip"
  );

  const urlMap = useMemo(() => {
    const map = new Map<string, string>();
    if (urlsResult) {
      urlsResult.forEach((f) => {
        if (f?.url && f._id) map.set(String(f._id), f.url);
      });
    }
    return map;
  }, [urlsResult]);

  return (
    <div className="flex flex-wrap gap-2 justify-end mb-1">
      {files.map((f) => {
        const url = f.url ?? urlMap.get(f._id);
        if (url && f.mimeType.startsWith("image/")) {
          return (
            <img
              key={f._id}
              src={url}
              alt={f.name}
              className="max-w-[200px] max-h-[200px] rounded-xl object-cover shadow-sm border border-border"
            />
          );
        }
        return (
          <div
            key={f._id}
            className="flex items-center gap-2 bg-muted/60 border border-border px-3 py-2 rounded-xl text-sm shadow-sm backdrop-blur-sm"
          >
            <Paperclip size={14} className="text-muted-foreground" />
            <span className="truncate max-w-[200px] font-medium text-foreground/80">
              {f.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
