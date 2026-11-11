"use client";
import GhostExtension from "./extension";
import React from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import TipTapMenuBar from "./menu-bar";
import Text from "@tiptap/extension-text";
import { Button } from "@/components/ui/button";

import { generate } from "./action";
import { readStreamableValue } from "ai/rsc";
import { Separator } from "@/components/ui/separator";
import { useThread } from "../../use-thread";
import useThreads from "../../use-threads";
import { api } from "@/trpc/react";
import { Input } from "@/components/ui/input";
import TagInput from "./tag-input";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { useLocalStorage } from "usehooks-ts";
import { Bot } from "lucide-react";
import AIComposeButton from "./ai-compose-button";
import FileAttachment, { EmailAttachment } from "./file-attachment";

type EmailEditorProps = {
  toValues: { label: string; value: string }[];
  ccValues: { label: string; value: string }[];

  subject: string;
  setSubject: (subject: string) => void;
  to: string[];
  /** Resolve true when sent; the editor only clears after a successful send. */
  handleSend: (value: string, attachments?: EmailAttachment[]) => void | boolean | Promise<void | boolean>;
  isSending: boolean;

  onToChange: (values: { label: string; value: string }[]) => void;
  onCcChange: (values: { label: string; value: string }[]) => void;

  bccValues?: { label: string; value: string }[];
  onBccChange?: (values: { label: string; value: string }[]) => void;

  defaultToolbarExpand?: boolean;
  /** HTML to start with (restored draft, forwarded message, quick reply). */
  initialContent?: string;
  /** Called (debounced by the caller) whenever the body changes, for autosave. */
  onContentChange?: (html: string) => void;
  /** Rendered above the recipients, e.g. Reply / Reply all / Forward tabs. */
  headerSlot?: React.ReactNode;
  /** e.g. "Saved 12:04" */
  statusText?: string;
  /** Account used for recipient suggestions (needed in the unified inbox). */
  accountIdOverride?: string;
};

// Debounce utility function for function calls
function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number,
): T {
  const timeoutRef = React.useRef<NodeJS.Timeout>();

  return React.useCallback(
    ((...args: any[]) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    }) as T,
    [callback, delay],
  );
}

const EmailEditor = ({
  toValues,
  ccValues,
  subject,
  setSubject,
  to,
  handleSend,
  isSending,
  onToChange,
  onCcChange,
  bccValues,
  onBccChange,
  defaultToolbarExpand,
  initialContent,
  onContentChange,
  headerSlot,
  statusText,
  accountIdOverride,
}: EmailEditorProps) => {
  const [ref] = useAutoAnimate();
  const [storedAccountId] = useLocalStorage("accountId", "");
  const accountId = accountIdOverride ?? storedAccountId;
  const { data: suggestions } = api.mail.getEmailSuggestions.useQuery(
    { accountId: accountId, query: "" },
    { enabled: !!accountId && accountId !== "all" },
  );
  const [attachments, setAttachments] = React.useState<EmailAttachment[]>([]);

  const [expanded, setExpanded] = React.useState(defaultToolbarExpand ?? false);

  const [generation, setGeneration] = React.useState("");

  const aiGenerate = async (prompt: string) => {
    const { output } = await generate(prompt);

    for await (const delta of readStreamableValue(output)) {
      if (delta) {
        setGeneration(delta);
      }
    }
  };

  const customText = Text.extend({
    addKeyboardShortcuts() {
      return {
        "Mod-j": () => {
          aiGenerate(this.editor.getText());
          return true;
        },
      };
    },
  });

  const editor = useEditor({
    autofocus: false,
    extensions: [StarterKit, customText, GhostExtension],
    content: initialContent ?? "",
    editorProps: {
      attributes: {
        placeholder: "Write your email here...",
      },
    },
    onUpdate: ({ editor }) => onContentChange?.(editor.getHTML()),
  });

  // Replace the body when the caller switches mode (reply → forward) or restores a draft.
  React.useEffect(() => {
    if (editor && initialContent !== undefined && editor.getHTML() !== initialContent) {
      editor.commands.setContent(initialContent, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialContent, editor]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "Enter" &&
        editor &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          document.activeElement?.tagName || "",
        )
      ) {
        editor.commands.focus();
      }
      if (event.key === "Escape" && editor) {
        editor.commands.blur();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [editor]);

  React.useEffect(() => {
    if (!generation || !editor) return;
    editor.commands.insertContent(generation);
  }, [generation, editor]);

  const sendingRef = React.useRef(false);
  const send = async () => {
    if (sendingRef.current) return; // guard against double sends
    sendingRef.current = true;
    try {
      const ok = await handleSend(editor?.getHTML() || "", attachments);
      if (ok !== false) {
        editor?.commands.clearContent();
        setAttachments([]);
      }
    } finally {
      sendingRef.current = false;
    }
  };

  // Cleanup function to prevent memory leaks
  React.useEffect(() => {
    return () => {
      // Cleanup any pending timeouts or async operations
    };
  }, []);

  return (
    <div>
      {headerSlot}
      <div className="flex border-b px-4 py-1.5">
        {editor && <TipTapMenuBar editor={editor} />}
      </div>

      <div ref={ref} className="space-y-2 p-4 pb-0">
        {expanded && (
          <>
            <TagInput
              suggestions={suggestions?.map((s) => s.address) || []}
              value={toValues}
              placeholder="Add tags"
              label="To"
              onChange={onToChange}
            />
            <TagInput
              suggestions={suggestions?.map((s) => s.address) || []}
              value={ccValues}
              placeholder="Add tags"
              label="Cc"
              onChange={onCcChange}
            />
            {onBccChange && (
              <TagInput
                suggestions={suggestions?.map((s) => s.address) || []}
                value={bccValues ?? []}
                placeholder="Add tags"
                label="Bcc"
                onChange={onBccChange}
              />
            )}
            <Input
              id="subject"
              className="w-full"
              placeholder="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left text-[13px] text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
          >
            <span className="font-medium text-foreground">{expanded ? "Hide details" : "To"} </span>
            {!expanded && <span>{to.length ? to.join(", ") : "Add recipients"}</span>}
          </button>
          {statusText && <span className="shrink-0 text-[11px] text-muted-foreground">{statusText}</span>}
          <AIComposeButton
            isComposing={defaultToolbarExpand}
            onGenerate={setGeneration}
          />
        </div>
      </div>

      <div className="prose w-full px-4">
        <EditorContent editor={editor} placeholder="Write your email here..." />
      </div>

      {/* File Attachments */}
      <div className="px-4 py-2">
        <FileAttachment
          attachments={attachments}
          onAttachmentsChange={setAttachments}
          maxFileSize={10 * 1024 * 1024} // 10MB
          maxFiles={10}
        />
      </div>

      <Separator />
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-xs text-muted-foreground">
          <kbd className="rounded border bg-muted px-1.5 py-0.5 font-sans text-[10px]">Ctrl J</kbd> AI autocomplete
        </span>
        <Button onClick={() => void send()} isLoading={isSending} disabled={isSending} className="h-8 px-4">
          Send
        </Button>
      </div>
    </div>
  );
};

export default EmailEditor;
