"use client";
import React, { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { TasksApp } from "./components/tasks-app";
import { useTrpcTaskStore } from "./components/store";

function Live() {
  const store = useTrpcTaskStore();
  return <TasksApp store={store} />;
}

export default function TasksPage() {
  return (
    <Suspense fallback={<Loader2 className="mx-auto mt-24 size-5 animate-spin text-muted-foreground" />}>
      <Live />
    </Suspense>
  );
}
