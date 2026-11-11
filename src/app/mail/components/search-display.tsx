"use client";
import { useSingleAccount } from "@/app/mail/use-single-account";
import DOMPurify from "dompurify";
import { useAtom } from "jotai";
import React from "react";
import { isSearchingAtom, searchValueAtom } from "@/lib/atoms";
import { api } from "@/trpc/react";
import { useDebounceValue, useLocalStorage } from "usehooks-ts";
import useThreads from "../use-threads";
import { useThread } from "../use-thread";
import { toast } from "sonner";
import { Loader2, Database } from "lucide-react";
import { Button } from "@/components/ui/button";

const SearchDisplay = () => {
  const [searchValue, setSearchValue] = useAtom(searchValueAtom);
  const [isSearching, setIsSearching] = useAtom(isSearchingAtom);
  const [_, setThreadId] = useThread();
  const search = api.search.search.useMutation();
  const populateIndex = api.search.populateIndex.useMutation();

  const [debouncedSearch] = useDebounceValue(searchValue, 500);
  const { accountId } = useSingleAccount();

  React.useEffect(() => {
    if (!debouncedSearch || !accountId) return;
    // console.log({ accountId, debouncedSearch });
    search.mutate({ accountId, query: debouncedSearch });
  }, [debouncedSearch, accountId]);

  const handlePopulateIndex = async () => {
    if (!accountId) return;

    try {
      const result = await populateIndex.mutateAsync({
        accountId,
        skipEmbeddings: false, // Set to true if you want to skip embeddings for faster indexing
      });
      toast.success(`Successfully indexed ${result.indexedCount} emails!`);
      // Retry the search after indexing
      if (debouncedSearch) {
        search.mutate({ accountId, query: debouncedSearch });
      }
    } catch (error) {
      toast.error("Failed to populate search index");
      console.error(error);
    }
  };

  return (
    <div className="max-h-[calc(100vh-50px)] overflow-y-scroll p-4">
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-sm text-gray-600 dark:text-gray-400">
          Your search for "{searchValue}" came back with...
        </h2>
        {search.isPending && (
          <Loader2 className="size-4 animate-spin text-gray-400" />
        )}
      </div>
      {search.data?.hits.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-8">
          <p className="text-gray-500">No results found.</p>
          <Button
            onClick={handlePopulateIndex}
            disabled={populateIndex.isPending}
            variant="outline"
            className="flex items-center gap-2"
          >
            {populateIndex.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Database className="size-4" />
            )}
            {populateIndex.isPending ? "Indexing..." : "Populate Search Index"}
          </Button>
          <p className="max-w-sm text-center text-xs text-gray-400">
            This will index your emails to enable full-text search. This may
            take a few moments.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {search.data?.hits.map((hit) => (
            <li
              onClick={() => {
                if (!hit.document.threadId) {
                  toast.error("This message is not part of a thread");
                  return;
                }
                setIsSearching(false);
                setThreadId(hit.document.threadId);
              }}
              key={hit.id}
              className="cursor-pointer rounded-md border p-4 transition-all hover:bg-gray-100 dark:hover:bg-gray-900"
            >
              <h3 className="text-base font-medium">{hit.document.title}</h3>
              <p className="text-sm text-gray-500">From: {hit.document.from}</p>
              <p className="text-sm text-gray-500">
                To: {hit.document.to.join(", ")}
              </p>
              <p
                className="mt-2 text-sm"
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(hit.document.rawBody, {
                    USE_PROFILES: { html: true },
                  }),
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SearchDisplay;
