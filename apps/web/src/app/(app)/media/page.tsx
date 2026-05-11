"use client";

import { useRef, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { qk } from "@/lib/query-keys";
import { toast } from "@/lib/toast";
import type { WorkspaceMedia } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Upload,
  Trash2,
  ImageIcon,
  Loader2,
  Copy,
  Check,
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Upload Zone ─────────────────────────────────────────────────────────────

function UploadZone({ onUploaded }: { onUploaded: (m: WorkspaceMedia) => void }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const results: WorkspaceMedia[] = [];
      for (const file of files) {
        setProgress(`Uploading ${file.name}…`);
        const formData = new FormData();
        formData.append("file", file);
        const { data } = await api.post<WorkspaceMedia>("/media/upload", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        results.push(data);
      }
      return results;
    },
    onSuccess: (results) => {
      setProgress(null);
      queryClient.invalidateQueries({ queryKey: qk.workspaceMedia });
      toast.success(
        results.length === 1
          ? `Uploaded ${results[0].originalName} (${fmtBytes(results[0].sizeBytes)})`
          : `Uploaded ${results.length} images`,
      );
      results.forEach(onUploaded);
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setProgress(null);
      toast.error(err.response?.data?.message ?? "Upload failed");
    },
  });

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files?.length) return;
      uploadMutation.mutate(Array.from(files));
    },
    [uploadMutation],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => !uploadMutation.isPending && fileInputRef.current?.click()}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 transition-all select-none",
        dragging
          ? "border-indigo-400 bg-indigo-500/8 scale-[1.01]"
          : "border-[#E5E7EB] dark:border-[#1e2433] hover:border-indigo-400/60 hover:bg-[#F9FAFB] dark:hover:bg-[#0d1017]",
        uploadMutation.isPending && "pointer-events-none opacity-60 cursor-default",
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {uploadMutation.isPending ? (
        <>
          <Loader2 className="size-8 animate-spin text-indigo-400" />
          <p className="text-sm font-medium text-[#6B7280]">{progress ?? "Processing…"}</p>
          <p className="text-xs text-[#9CA3AF]">Compressing image, please wait</p>
        </>
      ) : (
        <>
          <div className="flex size-14 items-center justify-center rounded-2xl bg-indigo-500/10">
            <Upload className="size-6 text-indigo-400" />
          </div>
          <div className="text-center">
            <p className="text-base font-semibold text-[#111827] dark:text-[#f3f4f6]">
              Click to upload, or drag images here
            </p>
            <p className="text-sm text-[#9CA3AF] mt-1">
              JPEG, PNG, WebP, HEIC — auto-compressed to max 1200px, ~80% quality
            </p>
            <p className="text-xs text-[#9CA3AF] mt-0.5">
              Multiple files supported · max 10 MB per file before compression
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Media Card ───────────────────────────────────────────────────────────────

function MediaCard({
  media,
  onDelete,
}: {
  media: WorkspaceMedia;
  onDelete: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyUrl = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(media.url);
    setCopied(true);
    toast.success("URL copied");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group relative overflow-hidden rounded-xl border border-[#E5E7EB] dark:border-[#1e2433] bg-white dark:bg-[#111420] hover:border-[#D1D5DB] dark:hover:border-[#2a2f3d] transition-colors">
      {/* Thumbnail */}
      <div className="relative aspect-square overflow-hidden bg-[#F3F4F6] dark:bg-[#1e2433]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={media.url}
          alt={media.originalName}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />

        {/* Hover overlay with actions */}
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={copyUrl}
            title="Copy URL"
            className="flex size-8 items-center justify-center rounded-lg bg-white/20 text-white backdrop-blur hover:bg-white/30 transition-colors"
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title="Delete"
            className="flex size-8 items-center justify-center rounded-lg bg-white/20 text-white backdrop-blur hover:bg-red-500/80 transition-colors"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="p-2.5">
        <p className="truncate text-xs font-medium text-[#111827] dark:text-[#f3f4f6]">
          {media.originalName}
        </p>
        <div className="mt-0.5 flex items-center justify-between">
          <span className="text-[10px] text-[#9CA3AF]">{fmtBytes(media.sizeBytes)}</span>
          <span className="text-[10px] text-[#9CA3AF]">{fmtDate(media.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MediaLibraryPage() {
  const queryClient = useQueryClient();
  const [lastUploaded, setLastUploaded] = useState<WorkspaceMedia | null>(null);

  const { data: media = [], isLoading } = useQuery({
    queryKey: qk.workspaceMedia,
    queryFn: async () => {
      const { data } = await api.get<WorkspaceMedia[]>("/media");
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/media/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.workspaceMedia });
      toast.success("Image deleted");
    },
    onError: () => toast.error("Failed to delete image"),
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#111827] dark:text-[#f3f4f6]">
            Media Library
          </h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            Upload and manage images for your campaigns, DMs, and automations.
            All images are auto-compressed on upload.
          </p>
        </div>
        {media.length > 0 && (
          <div className="text-right">
            <p className="text-sm font-semibold text-[#111827] dark:text-[#f3f4f6]">
              {media.length} {media.length === 1 ? "image" : "images"}
            </p>
            <p className="text-xs text-[#9CA3AF]">
              {fmtBytes(media.reduce((s, m) => s + m.sizeBytes, 0))} total
            </p>
          </div>
        )}
      </div>

      {/* Upload zone */}
      <UploadZone onUploaded={setLastUploaded} />

      {/* Last uploaded banner */}
      {lastUploaded && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lastUploaded.url}
            alt={lastUploaded.originalName}
            className="size-10 rounded-lg object-cover"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              Just uploaded — {lastUploaded.originalName}
            </p>
            <p className="text-xs text-[#6B7280] truncate">{lastUploaded.url}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 text-xs h-7"
            onClick={async () => {
              await navigator.clipboard.writeText(lastUploaded.url);
              toast.success("URL copied");
            }}
          >
            <Copy className="size-3 mr-1.5" />
            Copy URL
          </Button>
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-8 animate-spin text-[#9CA3AF]" />
        </div>
      ) : media.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-[#F3F4F6] dark:bg-[#1e2433]">
            <ImageIcon className="size-8 text-[#9CA3AF]" />
          </div>
          <p className="text-base font-semibold text-[#6B7280]">No images yet</p>
          <p className="text-sm text-[#9CA3AF]">
            Upload your first image above to get started
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {media.map((m) => (
            <MediaCard
              key={m.id}
              media={m}
              onDelete={() => deleteMutation.mutate(m.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
