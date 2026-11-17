"use client";

import { Provider } from "jotai";
import { ThemeProvider } from "@/components/theme-provicer";
import { TRPCReactProvider } from "@/trpc/react";
import { Toaster } from "sonner";
import { TaskRewards } from "@/components/task-rewards";

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <Provider>
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem
        disableTransitionOnChange
      >
        <TRPCReactProvider>
          {children}
          <TaskRewards />
        </TRPCReactProvider>
        <Toaster />
      </ThemeProvider>
    </Provider>
  );
}
