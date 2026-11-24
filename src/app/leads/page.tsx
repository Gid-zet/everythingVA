"use client";
import React from "react";
import { Loader2 } from "lucide-react";
import { LeadsApp } from "./components/leads-app";
import { useTrpcLeadsStore } from "./components/store";

function Live() {
  const store = useTrpcLeadsStore();
  return <LeadsApp store={store} />;
}

/** Client-only, like Tasks: relative times depend on the viewer's clock. */
export default function LeadsPage() {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return <Loader2 className="mx-auto mt-24 size-5 animate-spin text-muted-foreground" />;
  return <Live />;
}
