"use client";
import React from "react";
import { Loader2 } from "lucide-react";
import { JobsApp } from "./components/jobs-app";
import { useTrpcJobsStore } from "./components/store";

function Live() {
  const store = useTrpcJobsStore();
  return <JobsApp store={store} />;
}

/** Client-only, like Tasks: relative dates depend on the viewer's clock. */
export default function JobsPage() {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return <Loader2 className="mx-auto mt-24 size-5 animate-spin text-muted-foreground" />;
  return <Live />;
}
