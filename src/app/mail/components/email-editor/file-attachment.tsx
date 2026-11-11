"use client";

import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Paperclip,
  X,
  File,
  FileText,
  Image,
  Music,
  Video,
  Archive,
} from "lucide-react";
import { toast } from "sonner";
import { validateFile, formatFileSize } from "@/lib/file-utils";

export interface EmailAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  file: File;
}

interface FileAttachmentProps {
  attachments: EmailAttachment[];
  onAttachmentsChange: (attachments: EmailAttachment[]) => void;
  maxFileSize?: number; // in bytes, default 10MB
  maxFiles?: number; // default 10
}

const FileAttachment: React.FC<FileAttachmentProps> = ({
  attachments,
  onAttachmentsChange,
  maxFileSize = 10 * 1024 * 1024, // 10MB
  maxFiles = 10,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const getFileIcon = (type: string) => {
    if (type.startsWith("image/")) return <Image className="h-4 w-4" />;
    if (type.startsWith("video/")) return <Video className="h-4 w-4" />;
    if (type.startsWith("audio/")) return <Music className="h-4 w-4" />;
    if (type.includes("zip") || type.includes("rar") || type.includes("7z"))
      return <Archive className="h-4 w-4" />;
    if (type.includes("pdf") || type.includes("document"))
      return <FileText className="h-4 w-4" />;
    return <File className="h-4 w-4" />;
  };

  const validateFileLocal = (file: File): string | null => {
    // Use the imported validateFile function
    const validationError = validateFile(file, maxFileSize);
    if (validationError) {
      return validationError;
    }

    if (attachments.length >= maxFiles) {
      return `Maximum ${maxFiles} files allowed`;
    }

    // Additional validation for file types that might cause issues
    if (file.size > 5 * 1024 * 1024) {
      // 5MB warning
      return `Large file detected (${formatFileSize(file.size)}). This may take a moment to process.`;
    }

    // Warning for very large files
    if (file.size > 15 * 1024 * 1024) {
      return `Very large file detected (${formatFileSize(file.size)}). Processing may take several minutes.`;
    }

    // Check total size of existing attachments
    const totalSize =
      attachments.reduce((sum, att) => sum + att.size, 0) + file.size;
    if (totalSize > 50 * 1024 * 1024) {
      return `Total attachment size would exceed 50MB limit. Please remove some attachments first.`;
    }
    return null;
  };

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;

    const newAttachments: EmailAttachment[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    Array.from(files).forEach((file) => {
      const error = validateFileLocal(file);
      if (error) {
        if (error.includes("Large file detected")) {
          warnings.push(`${file.name}: ${error}`);
        } else {
          errors.push(`${file.name}: ${error}`);
        }
      } else {
        const attachment: EmailAttachment = {
          id: `${Date.now()}-${Math.random()}`,
          name: file.name,
          size: file.size,
          type: file.type,
          file: file,
        };
        newAttachments.push(attachment);
      }
    });

    if (errors.length > 0) {
      errors.forEach((error) => toast.error(error));
    }

    if (warnings.length > 0) {
      warnings.forEach((warning) => toast.warning(warning));
    }

    if (newAttachments.length > 0) {
      onAttachmentsChange([...attachments, ...newAttachments]);
      toast.success(`Added ${newAttachments.length} attachment(s)`);
    }
  };

  const removeAttachment = (id: string) => {
    const updatedAttachments = attachments.filter((att) => att.id !== id);
    onAttachmentsChange(updatedAttachments);
    toast.success("Attachment removed");
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  return (
    <div
      className="space-y-2"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Attachment Button */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          className="h-7 gap-1.5 px-2 text-[12px] text-muted-foreground hover:text-foreground"
        >
          <Paperclip className="h-3.5 w-3.5" />
          Attach
        </Button>
        <span className="text-[11px] text-muted-foreground/70">
          {attachments.length ? `${attachments.length}/${maxFiles} files` : `or drop files here · up to ${formatFileSize(maxFileSize)} each`}
        </span>
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFileSelect(e.target.files)}
        accept="*/*"
      />

      {/* Drag & Drop Area */}
      {/* Drop target appears only while dragging files over the composer area */}
      {isDragging && (
        <div className="rounded-lg border-2 border-dashed border-primary bg-primary/5 p-4 text-center">
          <Paperclip className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Drag and drop files here, or click "Attach Files"
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Max {formatFileSize(maxFileSize)} per file, up to {maxFiles} files
          </p>
        </div>
      )}

      {/* Attachments List */}
      {attachments.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Paperclip className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              Attachments ({attachments.length})
            </span>
          </div>
          <div className="space-y-1">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center justify-between rounded-lg bg-muted/50 p-2"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {getFileIcon(attachment.type)}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {attachment.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(attachment.size)}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeAttachment(attachment.id)}
                  className="h-6 w-6 p-0"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default FileAttachment;
