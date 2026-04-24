import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Download,
  Ellipsis,
  Share2,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  SettingsButton,
  SettingsCheckbox,
  SettingsEmptyState,
  SettingsPanel,
  SettingsSectionHeader,
} from "~/components/settings/settings-primitives";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/settings/history")({
  component: HistorySettings,
});

const PAGE_SIZE = 8;

function relativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) return years === 1 ? "about 1 year ago" : `${years} years ago`;
  if (months > 0) return months === 1 ? "about 1 month ago" : `${months} months ago`;
  if (days > 0) return days === 1 ? "1 day ago" : `${days} days ago`;
  if (hours > 0) return hours === 1 ? "about 1 hour ago" : `about ${hours} hours ago`;
  if (minutes > 0) return minutes === 1 ? "about 1 minute ago" : `about ${minutes} minutes ago`;
  return "just now";
}

function HistorySettings() {
  const threads = useQuery(api.threads.list) ?? [];
  const sharedThreads = useQuery(api.threads.listShared) ?? [];
  const archiveMany = useMutation(api.threads.archiveMany);
  const deleteMany = useMutation(api.threads.deleteMany);

  const [selected, setSelected] = useState<Set<Id<"threads">>>(new Set());
  const [sharedSelected, setSharedSelected] = useState<Set<Id<"threads">>>(new Set());
  const [page, setPage] = useState(0);
  const [showArchive, setShowArchive] = useState(false);

  const activeThreads = useMemo(() => threads.filter((thread) => !thread.isArchived), [threads]);
  const archivedThreads = useMemo(() => threads.filter((thread) => thread.isArchived), [threads]);
  const visibleThreads = showArchive ? archivedThreads : activeThreads;
  const totalPages = Math.max(1, Math.ceil(visibleThreads.length / PAGE_SIZE));
  const pagedThreads = visibleThreads.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => {
    setSelected(new Set());
    setPage(0);
  }, [showArchive]);

  useEffect(() => {
    if (page > totalPages - 1) {
      setPage(totalPages - 1);
    }
  }, [page, totalPages]);

  const pageSelected =
    pagedThreads.length > 0 && pagedThreads.every((thread) => selected.has(thread._id));
  const allSharedSelected =
    sharedThreads.length > 0 && sharedThreads.every((thread) => sharedSelected.has(thread._id));

  const toggleSelect = (threadId: Id<"threads">) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((current) => {
      const next = new Set(current);
      if (pageSelected) {
        pagedThreads.forEach((thread) => next.delete(thread._id));
      } else {
        pagedThreads.forEach((thread) => next.add(thread._id));
      }
      return next;
    });
  };

  const toggleSharedSelect = (threadId: Id<"threads">) => {
    setSharedSelected((current) => {
      const next = new Set(current);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      return next;
    });
  };

  const toggleSharedSelectAll = () => {
    if (allSharedSelected) {
      setSharedSelected(new Set());
      return;
    }

    setSharedSelected(new Set(sharedThreads.map((thread) => thread._id)));
  };

  const handleArchive = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;

    try {
      await archiveMany({ threadIds: ids });
      toast.success(`${ids.length} thread${ids.length > 1 ? "s" : ""} archived.`);
      setSelected(new Set());
    } catch {
      toast.error("Failed to archive threads.");
    }
  };

  const handleDelete = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;

    try {
      await deleteMany({ threadIds: ids });
      toast.success(`${ids.length} thread${ids.length > 1 ? "s" : ""} deleted.`);
      setSelected(new Set());
    } catch {
      toast.error("Failed to delete threads.");
    }
  };

  const handleDeleteAll = async () => {
    try {
      const allIds = threads.map((thread) => thread._id);
      if (allIds.length > 0) {
        await deleteMany({ threadIds: allIds });
      }
      toast.success("All chat history deleted.");
      setSelected(new Set());
    } catch {
      toast.error("Failed to delete all chat history.");
    }
  };

  return (
    <div className="space-y-5">
      <SettingsSectionHeader
        title="Chat History"
        description="You can back up your chat history from here to restore or transfer your conversations later. Importing will not delete any of your existing conversations."
        action={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-zinc-200 bg-white text-zinc-600 shadow-[0_2px_8px_rgba(0,0,0,0.035)] transition-all duration-200 hover:-translate-y-0.5 hover:text-zinc-900"
                aria-label="History actions"
              >
                <Ellipsis className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => toast.info("Export is not wired yet.")}>
                <Download className="mr-2 h-4 w-4" />
                Export All Chats
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toast.info("Import is not wired yet.")}>
                <Upload className="mr-2 h-4 w-4" />
                Import Chats
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <div className="space-y-3">
        <SettingsPanel className="overflow-hidden p-0">
          <div className="overflow-hidden rounded-[14px]">
            <table className="w-full border-collapse text-left">
              <thead className="bg-zinc-50">
                <tr className="border-b border-black/[0.06]">
                  <th className="px-3.5 py-2.5">
                    <div className="flex items-center gap-3">
                      <SettingsCheckbox
                        checked={pageSelected}
                        onChange={toggleSelectAll}
                        ariaLabel="Select current page"
                      />
                      <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-zinc-500">Title</span>
                    </div>
                  </th>
                  <th className="px-3.5 py-2.5 text-right">
                    {selected.size > 0 ? (
                      <div className="flex justify-end gap-2">
                        {!showArchive ? (
                          <SettingsButton type="button" variant="secondary" onClick={handleArchive}>
                            <Archive className="mr-1.5 h-3.5 w-3.5" />
                            Archive ({selected.size})
                          </SettingsButton>
                        ) : null}
                        <SettingsButton type="button" variant="destructive" onClick={handleDelete}>
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                          Delete ({selected.size})
                        </SettingsButton>
                      </div>
                    ) : (
                      <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-zinc-400">Updated</span>
                    )}
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagedThreads.length === 0 ? (
                  <tr>
                    <td colSpan={2}>
                      <SettingsEmptyState
                        icon={<Archive className="h-5 w-5" />}
                        title={showArchive ? "No archived chats." : "No chat history yet."}
                        description={
                          showArchive
                            ? "Archived threads will appear here when you move them out of your main list."
                            : "As you start conversations, they will appear here with timestamps and bulk actions."
                        }
                        className="min-h-[200px]"
                      />
                    </td>
                  </tr>
                ) : (
                  pagedThreads.map((thread) => (
                    <tr
                      key={thread._id}
                      className={cn(
                        "border-b border-black/[0.06] transition-colors duration-200 hover:bg-zinc-50",
                        selected.has(thread._id) && "bg-zinc-100",
                      )}
                    >
                      <td className="px-3.5 py-2.5">
                        <div className="flex items-center gap-3">
                          <SettingsCheckbox
                            checked={selected.has(thread._id)}
                            onChange={() => toggleSelect(thread._id)}
                            ariaLabel={`Select ${thread.title ?? "thread"}`}
                          />
                          <span
                            className="truncate text-[12.5px] text-zinc-800"
                            title={thread.title || `Chat ${thread._id.slice(-4)}`}
                          >
                            {thread.title || `Chat ${thread._id.slice(-4)}`}
                          </span>
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5 text-right text-[12px] text-zinc-500">
                        {relativeTime(thread._creationTime)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SettingsPanel>

        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <SettingsButton
            type="button"
            variant="secondary"
            onClick={() => setShowArchive((current) => !current)}
            className="w-fit"
          >
            <Archive className="mr-1.5 h-3.5 w-3.5" />
            {showArchive ? "Back to History" : "Open Archive"}
          </SettingsButton>

          <div className="flex gap-2">
            <SettingsButton
              type="button"
              variant="secondary"
              disabled={page === 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
            >
              <ChevronLeft className="mr-1.5 h-3.5 w-3.5" />
              Previous
            </SettingsButton>
            <SettingsButton
              type="button"
              variant="secondary"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
            >
              Next
              <ChevronRight className="ml-1.5 h-3.5 w-3.5" />
            </SettingsButton>
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <div className="space-y-0.5">
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
            Shared Threads
          </h3>
          <p className="text-[12.5px] leading-[1.55] text-zinc-500">Manage your shared threads here.</p>
        </div>

        <SettingsPanel className="overflow-hidden p-0">
          <div className="overflow-hidden rounded-[14px]">
            <table className="w-full border-collapse text-left">
              <thead className="bg-zinc-50">
                <tr className="border-b border-black/[0.06]">
                  <th className="px-3.5 py-2.5">
                    <div className="flex items-center gap-3">
                      <SettingsCheckbox
                        checked={allSharedSelected}
                        onChange={toggleSharedSelectAll}
                        ariaLabel="Select shared threads"
                      />
                      <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-zinc-500">Title</span>
                    </div>
                  </th>
                  <th className="px-3.5 py-2.5 text-right text-[12px] font-semibold uppercase tracking-[0.06em] text-zinc-400">
                    Shared
                  </th>
                </tr>
              </thead>
              <tbody>
                {sharedThreads.length === 0 ? (
                  <tr>
                    <td colSpan={2}>
                      <SettingsEmptyState
                        icon={<Share2 className="h-5 w-5" />}
                        title="No threads found."
                        description="No threads found. You can share threads by clicking the share button in the top right corner when you are in a thread."
                        className="min-h-[200px]"
                      />
                    </td>
                  </tr>
                ) : (
                  sharedThreads.map((thread) => (
                    <tr
                      key={thread._id}
                      className={cn(
                        "border-b border-black/[0.06] transition-colors duration-200 hover:bg-zinc-50",
                        sharedSelected.has(thread._id) && "bg-zinc-100",
                      )}
                    >
                      <td className="px-3.5 py-2.5">
                        <div className="flex items-center gap-3">
                          <SettingsCheckbox
                            checked={sharedSelected.has(thread._id)}
                            onChange={() => toggleSharedSelect(thread._id)}
                            ariaLabel={`Select shared thread ${thread.title ?? ""}`}
                          />
                          <span
                            className="truncate text-[12.5px] text-zinc-800"
                            title={thread.title || `Chat ${thread._id.slice(-4)}`}
                          >
                            {thread.title || `Chat ${thread._id.slice(-4)}`}
                          </span>
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5 text-right text-[12px] text-zinc-500">
                        {relativeTime(thread._creationTime)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SettingsPanel>
      </section>

      <section className="space-y-3">
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
          Danger Zone
        </h3>
        <SettingsPanel className="space-y-3 border-zinc-200 bg-zinc-50">
          <p className="max-w-2xl text-[12.5px] leading-[1.55] text-zinc-500">
            Permanently delete your history from both your local device and our servers.
          </p>
          <SettingsButton type="button" variant="destructive" onClick={handleDeleteAll} className="w-fit">
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Delete Chat History
          </SettingsButton>
          <p className="text-[11.5px] leading-[1.55] text-zinc-400">
            Note: The retention policies of our LLM hosting partners may vary.
          </p>
        </SettingsPanel>
      </section>
    </div>
  );
}
