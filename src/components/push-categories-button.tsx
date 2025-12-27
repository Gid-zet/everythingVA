"use client";
import { Button } from "@/components/ui/button";
import { api } from "@/trpc/react";
import { useLocalStorage } from "usehooks-ts";
import { toast } from "sonner";
import { RefreshCw, Upload } from "lucide-react";

export default function PushCategoriesButton() {
  const [accountId] = useLocalStorage("accountId", "");

  const pushCategoriesMutation = api.mail.pushCategoriesToEmailProvider.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        const labelsMessage = data.labelsCreated 
          ? `Created ${data.labelsCreated} label${data.labelsCreated !== 1 ? "s" : ""} and `
          : "";
        toast.success(
          `${labelsMessage}Successfully pushed categories as labels to ${data.successCount} email${data.successCount !== 1 ? "s" : ""}.`
        );
      } else if (data.needsReauth) {
        // Show re-auth message prominently
        const message = data.errors && data.errors[0] 
          ? data.errors[0]
          : "Account needs re-authorization. Please re-authorize your email account before pushing categories.";
        toast.error(message, {
          duration: 8000, // Show for longer so user can read it
        });
        if (data.errors && data.errors.length > 1) {
          console.error("Additional push errors:", data.errors.slice(1));
        }
      } else if (data.needsResync) {
        // Show re-sync message prominently
        const message = data.errors && data.errors[0] 
          ? data.errors[0]
          : "Emails need to be re-synced. Please sync your emails first to update email IDs, then try pushing categories again.";
        toast.error(message, {
          duration: 10000, // Show for longer so user can read it
        });
        if (data.errors && data.errors.length > 1) {
          console.error("Additional push errors:", data.errors.slice(1));
        }
      } else {
        toast.warning(
          `Pushed categories to ${data.successCount} email${data.successCount !== 1 ? "s" : ""}, but ${data.errorCount} failed.`
        );
        if (data.errors && data.errors.length > 0) {
          // Log first few errors to console, but don't overwhelm user
          console.error("Push errors:", data.errors.slice(0, 5));
        }
      }
    },
    onError: (error) => {
      toast.error(`Failed to push categories: ${error.message}`);
    },
  });

  const handlePushCategories = async () => {
    if (!accountId) {
      toast.error("No account selected");
      return;
    }

    pushCategoriesMutation.mutate({ accountId });
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handlePushCategories}
      disabled={!accountId || pushCategoriesMutation.isPending}
      className="flex items-center gap-2"
    >
      {pushCategoriesMutation.isPending ? (
        <RefreshCw className="h-4 w-4 animate-spin" />
      ) : (
        <Upload className="h-4 w-4" />
      )}
      {pushCategoriesMutation.isPending
        ? "Pushing..."
        : "Push Categories to Email Provider"}
    </Button>
  );
}
