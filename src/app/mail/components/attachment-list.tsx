"use client";

import React from "react";
import { Download, Eye, FileText, Image as ImageIcon, Paperclip, X } from "lucide-react";
import { formatFileSize } from "@/lib/file-utils";

type Attachment = { id: string; name: string; mimeType: string; size: number };

const PREVIEWABLE = /^(image\/(png|jpe?g|gif|webp)|application\/pdf)$/i;

/** Attachments of one message: download any file, preview images and PDFs inline. */
export function AttachmentList({
  accountId,
  messageId,
  attachments,
}: {
  accountId: string;
  messageId: string;
  attachments: Attachment[];
}) {
  const [preview, setPreview] = React.useState<Attachment | null>(null);
  const url = (a: Attachment, inline = false) =>
    `/api/attachments/${encodeURIComponent(accountId)}/${encodeURIComponent(messageId)}/${encodeURIComponent(a.id)}${inline ? "?inline=1" : ""}`;

  return (
    <div className="mt-3">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Paperclip className="size-3" />
        {attachments.length} attachment{attachments.length === 1 ? "" : "s"}
      </p>
      <ul className="flex flex-wrap gap-2">
        {attachments.map((a) => {
          const canPreview = PREVIEWABLE.test(a.mimeType);
          const Icon = a.mimeType.startsWith("image/") ? ImageIcon : FileText;
          return (
            <li key={a.id} className="group flex max-w-[260px] items-center gap-2 rounded-lg border bg-background py-1.5 pl-2 pr-1 text-xs">
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{a.name}</span>
                <span className="text-[10px] text-muted-foreground">{formatFileSize(a.size)}</span>
              </span>
              {canPreview && (
                <button
                  type="button"
                  onClick={() => setPreview(a)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={`Preview ${a.name}`}
                >
                  <Eye className="size-3.5" />
                </button>
              )}
              <a
                href={url(a)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`Download ${a.name}`}
              >
                <Download className="size-3.5" />
              </a>
            </li>
          );
        })}
      </ul>

      {preview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={preview.name}
          className="fixed inset-0 z-50 flex flex-col bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setPreview(null)}
        >
          <div className="mb-3 flex items-center gap-3 text-white" onClick={(e) => e.stopPropagation()}>
            <span className="truncate text-sm font-medium">{preview.name}</span>
            <a href={url(preview)} className="ml-auto inline-flex items-center gap-1 rounded-md bg-white/10 px-2.5 py-1 text-xs hover:bg-white/20">
              <Download className="size-3.5" /> Download
            </a>
            <button type="button" onClick={() => setPreview(null)} className="rounded-md p-1.5 hover:bg-white/10" aria-label="Close preview">
              <X className="size-4" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {preview.mimeType.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url(preview, true)} alt={preview.name} className="max-h-full max-w-full rounded-lg object-contain" />
            ) : (
              <iframe src={url(preview, true)} title={preview.name} className="h-full w-full max-w-5xl rounded-lg bg-white" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
