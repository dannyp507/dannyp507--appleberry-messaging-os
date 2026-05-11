"use client";

import { useRef, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { qk } from "@/lib/query-keys";
import { toast } from "@/lib/toast";
import type { WorkspaceMedia } from "@/lib/api/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Upload,
  Trash2,
  ImageIcon,
  Loader2,
  CheckCircle2,
  X,
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Upload Zone ─────────────────────────────────────────────────────────────

function UploadZone({
  onUploaded,
}: {
  onUploaded: (media: WorkspaceMedia) => void;
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await api.post<WorkspaceMedia>("/media/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return data;
    },
    onSuccess: (media) => {
      queryClient.invalidateQueries({ queryKey: qk.workspaceMedia });
      toast.success(`Uploaded ${media.originalName} (${fmtBytes(media.sizeBytes)})`);
      onUploaded(media);
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message ?? "Upload failed");
    },
  });

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files?.length) return;
      uploadMutation.mutate(files[0]);
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
      onClick={() => fileInputRef.current?.click()}
      className={cn(
        "relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 transition-colors select-none",
        dragging
          ? "border-indigo-400 bg-indigo-500/10"
          : "border-[#E5E7EB] dark:border-[#1e2433] hover:border-indigo-400/50 hover:bg-[#F9FAFB] dark:hover:bg-[#0d1017]",
        uploadMutation.isPending && "pointer-events-none opacity-60",
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {uploadMutation.isPending ? (
        <>
          <Loader2 className="size-7 animate-spin text-indigo-400" />
          <p className="text-sm font-medium text-[#6B7280]">Compressing & uploading…</p>
        </>
      ) : (
        <>
          <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-500/10">
            <Upload className="size-5 text-indigo-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-[#111827] dark:text-[#f3f4f6]">
              Click or drag to upload
            </p>
            <p className="text-xs text-[#9CA3AF] mt-0.5">
              JPEG, PNG, WebP, HEIC — auto-compressed to max 1200px
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Media Grid ───────────────────────────────────────────────────────────────

function MediaGrid({
  media,
  selectedUrl,
  onSelect,
  onDelete,
}: {
  media: WorkspaceMedia[];
  selectedUrl: string;
  onSelect: (m: WorkspaceMedia) => void;
  onDelete: (id: string) => void;
}) {
  if (!media.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-[#F3F4F6] dark:bg-[#1e2433]">
          <ImageIcon className="size-6 text-[#9CA3AF]" />
        </div>
        <p className="text-sm font-medium text-[#6B7280]">No images yet</p>
        <p className="text-xs text-[#9CA3AF]">Upload your first image above</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {media.map((m) => {
        const isSelected = m.url === selectedUrl;
        return (
          <div
            key={m.id}
            onClick={() => onSelect(m)}
            className={cn(
              "group relative cursor-pointer overflow-hidden rounded-xl border-2 transition-all",
              isSelected
                ? "border-indigo-500 ring-2 ring-indigo-500/30"
                : "border-transparent hover:border-[#D1D5DB] dark:hover:border-[#2a2f3d]",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={m.url}
              alt={m.originalName}
              className="aspect-square w-full object-cover"
            />

            {/* Selected check */}
            {isSelected && (
              <div className="absolute inset-0 flex items-center justify-center bg-indigo-500/20">
                <CheckCircle2 className="size-6 text-indigo-500 drop-shadow" />
              </div>
            )}

            {/* Delete button */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(m.id); }}
              className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-lg bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-500"
            >
              <Trash2 className="size-3" />
            </button>

            {/* File size badge */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1 pt-4 opacity-0 transition-opacity group-hover:opacity-100">
              <p className="truncate text-[9px] text-white/80">{m.originalName}</p>
              <p className="text-[9px] font-semibold text-white">{fmtBytes(m.sizeBytes)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── MediaPicker (exported) ───────────────────────────────────────────────────

/**
 * Drop-in replacement for a plain URL <Input>.
 * Shows the currently picked image (thumbnail) and a button to open the picker modal.
 *
 * Usage:
 *   <MediaPicker value={form.mediaUrl} onChange={(url) => setField("mediaUrl", url)} />
 */
export function MediaPicker({
  value,
  onChange,
  label = "Media Image",
  placeholder = "No image selected",
}: {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: media = [], isLoading } = useQuery({
    queryKey: qk.workspaceMedia,
    queryFn: async () => {
      const { data } = await api.get<WorkspaceMedia[]>("/media");
      return data;
    },
    enabled: open,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/media/${id}`);
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: qk.workspaceMedia });
      // If the deleted image was selected, clear the value
      const deletedMedia = media.find((m) => m.id === id);
      if (deletedMedia?.url === value) onChange("");
    },
    onError: () => toast.error("Failed to delete image"),
  });

  const handleSelect = (m: WorkspaceMedia) => {
    onChange(m.url);
    setOpen(false);
  };

  const handleUploaded = (m: WorkspaceMedia) => {
    onChange(m.url);
  };

  return (
    <>
      {/* Trigger / preview area */}
      <div className="flex items-center gap-2">
        {value ? (
          <div className="relative flex-1 overflow-hidden rounded-xl border border-[#E5E7EB] dark:border-[#1e2433]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt="Selected media"
              className="h-16 w-full object-cover"
            />
            <button
              type="button"
              onClick={() => onChange("")}
              className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-lg bg-black/60 text-white hover:bg-red-500"
            >
              <X className="size-3" />
            </button>
          </div>
        ) : (
          <div className="flex-1 truncate rounded-xl border border-dashed border-[#E5E7EB] dark:border-[#1e2433] px-3 py-2 text-xs text-[#9CA3AF]">
            {placeholder}
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          className="shrink-0 h-8 text-xs"
        >
          <ImageIcon className="size-3.5 mr-1.5" />
          {value ? "Change" : "Pick"}
        </Button>
      </div>

      {/* Picker modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <ImageIcon className="size-4 text-indigo-400" />
              {label}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pb-2">
            <UploadZone onUploaded={handleUploaded} />

            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="size-6 animate-spin text-[#9CA3AF]" />
              </div>
            ) : (
              <MediaGrid
                media={media}
                selectedUrl={value}
                onSelect={handleSelect}
                onDelete={(id) => deleteMutation.mutate(id)}
              />
            )}
          </div>

          {value && (
            <div className="border-t border-[#E5E7EB] dark:border-[#1e2433] pt-3 flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">Selected</p>
                <p className="text-xs text-[#6B7280] truncate">{value}</p>
              </div>
              <Button size="sm" onClick={() => setOpen(false)} className="stitch-gradient text-white border-0 text-xs">
                Use this image
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
