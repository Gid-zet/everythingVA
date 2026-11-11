//@ts-ignore
import { createKeybindingsHandler } from "tinykeys";
import { api, type RouterOutputs } from "@/trpc/react";
import { useQueryClient } from "@tanstack/react-query";
import { useRegisterActions } from "kbar";
import React, { useMemo } from "react";
import { useLocalStorage } from "usehooks-ts";
import { useThread } from "../../use-thread";
import { useAtom } from "jotai";
import { toast } from "sonner";
import { getQueryKey } from "@trpc/react-query";
import useRefetch from "@/hooks/use-refetch";
import useThreads from "../../use-threads";
import { useThreadActions } from "../../use-thread-actions";
import {
  isSearchingAtom,
  visualModeAtom,
  visualModeStartIdAtom,
} from "@/lib/atoms";

const useVim = () => {
  const queryClient = useQueryClient();
  const [threadId, setThreadId] = useThread();
  const [accountId] = useLocalStorage("accountId", "");
  const [tab] = useLocalStorage("normalhuman-tab", "inbox");
  const { threads: data, mode } = useThreads();

  const actions = useThreadActions();

  const [visualMode, setVisualMode] = useAtom(visualModeAtom);
  const [visualModeStartId, setVisualModeStartId] = useAtom(
    visualModeStartIdAtom,
  );

  const selectedThreadIds = useMemo(() => {
    if (!visualMode || !visualModeStartId || !threadId || !data) return [];

    const startIndex = data.findIndex((t) => t.id === visualModeStartId);
    const endIndex = data.findIndex((t) => t.id === threadId);

    if (startIndex === -1 || endIndex === -1) return [];

    const start = Math.min(startIndex, endIndex);
    const end = Math.max(startIndex, endIndex);

    return data.slice(start, end + 1).map((t) => t.id);
  }, [visualMode, visualModeStartId, threadId, data]);

  const numberRef = React.useRef(0);

  React.useEffect(() => {
    numberRef.current = selectedThreadIds.length;
  }, [selectedThreadIds]);

  React.useEffect(() => {
    if (visualMode) {
      toast.info(
        `${numberRef.current} thread${numberRef.current !== 1 ? "s" : ""} selected`,
        {
          id: "visual-mode-toast",
          duration: Infinity,
          position: "bottom-center",
        },
      );
    } else {
      toast.dismiss("visual-mode-toast");
    }
  }, [visualMode, selectedThreadIds]);

  React.useEffect(() => {
    if (!threadId) return;
    // move thread it into view
    const element = document.getElementById(`thread-${threadId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [threadId]);

  const isInputElement = (element: Element | null): boolean => {
    return !!(
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement ||
      element?.hasAttribute("contenteditable")
    );
  };

  const withTargets = (fn: (ids: string[]) => unknown) => {
    if (!threadId) return;
    void fn(visualMode && selectedThreadIds.length ? selectedThreadIds : [threadId]);
    setVisualMode(false);
    setVisualModeStartId(null);
  };
  const archiveOrDone = () => {
    if (mode !== "active") return;
    withTargets(actions.archive);
  };

  let handler = (event: KeyboardEvent) => {
    if (isInputElement(document.activeElement)) {
      return;
    }

    return createKeybindingsHandler({
      j: () => {
        // Move cursor down
        if (data && data.length > 0) {
          if (!threadId) {
            setThreadId(data[0]!.id);
            return;
          }
          const currentIndex = data.findIndex((t) => t.id === threadId);
          if (currentIndex < data.length - 1) {
            const nextId = data[currentIndex + 1]!.id;
            setThreadId(nextId);
          }
        }
      },
      k: () => {
        // Move cursor up
        if (data && data.length > 0) {
          if (!threadId) {
            setThreadId(data[0]!.id);
            return;
          }
          const currentIndex = data.findIndex((t) => t.id === threadId);
          if (currentIndex > 0) {
            const prevId = data[currentIndex - 1]!.id;
            setThreadId(prevId);
          }
        }
      },
      "g g": () => {
        // Move to the first thread
        if (data && data.length > 0) {
          const firstId = data[0]!.id;
          setThreadId(firstId);
        }
      },
      "Shift+G": () => {
        // Move to the last thread
        if (data && data.length > 0) {
          const lastId = data[data.length - 1]!.id;
          setThreadId(lastId);
        }
      },
      "Shift+V": () => {
        setVisualMode(true);
        if (!threadId) return;
        setVisualModeStartId(threadId);
      },
      Escape: () => {
        setVisualMode(false);
        setVisualModeStartId(null);
      },
      d: () => archiveOrDone(),
      e: () => archiveOrDone(),
      u: () => {
        if (mode !== "done") return;
        withTargets(actions.unarchive);
      },
      // Snooze from the keyboard: tomorrow 8am (the toolbar has the full picker).
      h: () => {
        if (mode !== "active") return;
        const until = new Date();
        until.setDate(until.getDate() + 1);
        until.setHours(8, 0, 0, 0);
        withTargets((ids) => actions.snooze(ids, until));
      },
      "Shift+#": () => {
        if (mode === "trash") return;
        withTargets(actions.trash);
      },
      // Star toggle (Gmail's "s"); applies the opposite of the first target's state.
      s: () =>
        withTargets((ids) => {
          const first = data?.find((t) => t.id === ids[0]);
          return actions.setStarred(ids, !first?.starred);
        }),
      "Shift+U": () => withTargets((ids) => actions.setRead(ids, false, { silent: false })),
      "Shift+!": () => {
        if (mode === "spam" || mode === "trash") return;
        withTargets(actions.spam);
      },
    })(event);
  };

  React.useEffect(() => {
    if (typeof window == "undefined") return;
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [handler, threadId, data, visualMode, visualModeStartId]);

  return { selectedThreadIds, visualMode };
};

export default useVim;
