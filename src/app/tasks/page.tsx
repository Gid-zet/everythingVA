"use client";
import React, { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { TasksApp } from "./components/tasks-app";
import { useTrpcTaskStore } from "./components/store";

function Live() {
  const store = useTrpcTaskStore();
  return <TasksApp store={store} />;
}

/**
 * Rendered in the browser only: "today", due dates and streaks depend on the
 * user's time zone, which the server doesn't know.
 */
export default function TasksPage() {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const spinner = <Loader2 className="mx-auto mt-24 size-5 animate-spin text-muted-foreground" />;
  if (!mounted) return spinner;
  return (
    <Suspense fallback={spinner}>
      <Live />
    </Suspense>
  );
}
