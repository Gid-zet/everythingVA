"use client";
import React from "react";
import { api } from "@/trpc/react";
import { useThread } from "../use-thread";
import { useCurrentThread } from "../use-threads";
import { Composer } from "./composer";

/** Inline composer under the open thread; restores an autosaved draft if there is one. */
const ReplyBox = () => {
  const [threadId] = useThread();
  const { data: thread } = useCurrentThread(threadId);
  const accountId = thread?.accountId;
  const { data: draft, isLoading } = api.mail.getDraftForThread.useQuery(
    { accountId: accountId ?? "", threadId: threadId ?? "" },
    { enabled: !!accountId && !!threadId },
  );
  if (!thread || !accountId || isLoading) return null;
  return <Composer key={`${thread.id}-${draft?.id ?? "none"}`} accountId={accountId} thread={thread} draft={draft} compact />;
};

export default ReplyBox;
