"use client";
import { Button } from "@/components/ui/button";
import { getAurinkoAuthorizationUrl } from "@/lib/connect-url";
import { api } from "@/trpc/react";
import { useLocalStorage } from "usehooks-ts";
import { toast } from "sonner";
import { RefreshCw, AlertCircle } from "lucide-react";
import { useEffect, useRef } from "react";

export default function AuthoriseButton() {
  const syncEmails = api.mail.syncEmails.useMutation();
  const [accountId, setAccountId] = useLocalStorage("accountId", "");
  const hasRefetchedRef = useRef(false);

  const { data: authStatus, refetch: refetchAuthStatus } = api.mail.checkAccountAuth.useQuery(
    { accountId },
    { 
      enabled: !!accountId,
      refetchOnWindowFocus: true,
      refetchOnMount: true,
    },
  );

  // Refetch auth status when component mounts (e.g., after returning from authorization)
  // This helps detect when the user returns from the OAuth flow
  useEffect(() => {
    // Check if we're returning from authorization
    const wasAuthorizing = sessionStorage.getItem("authorizing");
    
    if (wasAuthorizing === "true" && accountId) {
      sessionStorage.removeItem("authorizing");
      // Delay to ensure the database has been updated after callback
      const timer = setTimeout(() => {
        refetchAuthStatus();
        toast.success("Authorization successful! You can now sync your emails.");
      }, 1500);
      return () => clearTimeout(timer);
    } else if (accountId && !hasRefetchedRef.current) {
      // Initial mount - refetch to ensure we have latest status
      const timer = setTimeout(() => {
        refetchAuthStatus();
        hasRefetchedRef.current = true;
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [accountId, refetchAuthStatus]);

  const handleSyncEmails = async () => {
    if (!accountId) {
      toast.error("No account selected");
      return;
    }

    // Always refetch auth status first to get the latest state
    const { data: updatedAuthStatus } = await refetchAuthStatus();
    
    if (updatedAuthStatus?.needsReauth) {
      toast.error(
        "Your account needs to be re-authorized. Please click 'Authorize Email' to continue.",
        {
          action: {
            label: "Authorize",
            onClick: () => {
              getAurinkoAuthorizationUrl("Google").then((url) => {
                window.location.href = url;
              });
            },
          },
        },
      );
      return;
    }

    syncEmails.mutate(
      { accountId },
      {
        onSuccess: () => {
          toast.success("Emails synced successfully");
        },
        onError: (error) => {
          console.error("Sync error:", error);
          if (error.message === "TOKEN_EXPIRED") {
            toast.error(
              "Your account authorization has expired. Please re-authorize your account.",
              {
                action: {
                  label: "Re-authorize",
                  onClick: () => {
                    getAurinkoAuthorizationUrl("Google").then((url) => {
                      window.location.href = url;
                    });
                  },
                },
              },
            );
          } else {
            toast.error(`Failed to sync emails: ${error.message}`);
          }
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        size="sm"
        variant={"outline"}
        onClick={handleSyncEmails}
        disabled={syncEmails.isPending || authStatus?.needsReauth}
        className="flex items-center gap-2"
      >
        {syncEmails.isPending ? (
          <RefreshCw className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        {syncEmails.isPending
          ? "Syncing..."
          : authStatus?.needsReauth
            ? "Re-authorize Required"
            : "Sync Emails"}
      </Button>
      <Button
        size="sm"
        variant={"outline"}
        onClick={async () => {
          const url = await getAurinkoAuthorizationUrl("Google");
          // Store a flag to indicate we're going to authorize
          sessionStorage.setItem("authorizing", "true");
          window.location.href = url;
        }}
        className="flex items-center gap-2"
      >
        <AlertCircle className="h-4 w-4" />
        Authorize Email
      </Button>
    </div>
  );
}
