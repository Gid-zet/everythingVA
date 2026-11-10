"use client";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Loader2, Search, X } from "lucide-react";
import React from "react";
import useThreads from "../use-threads";
import { useAtom } from "jotai";
import { isSearchingAtom, searchValueAtom } from "@/lib/atoms";

const SearchBar = () => {
  const { isFetching } = useThreads();
  const [searchValue, setSearchValue] = useAtom(searchValueAtom);
  const [isSearching, setIsSearching] = useAtom(isSearchingAtom);
  const ref = React.useRef<HTMLInputElement>(null);
  const handleBlur = () => {
    if (!!searchValue) return;
    setIsSearching(false);
  };
  // add escape key to close
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleBlur();
        ref.current?.blur();
      }
      if (
        e.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          document.activeElement?.tagName || "",
        )
      ) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [setIsSearching, searchValue, isSearching]);

  return (
    <div className="px-3 pb-1 pt-3">
      <motion.div className="relative" layoutId="search-bar">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          ref={ref}
          placeholder="Search mail"
          className="h-9 rounded-lg border-transparent bg-muted/60 pl-9 pr-16 text-[13px] shadow-none transition-colors placeholder:text-muted-foreground focus-visible:border-brand/40 focus-visible:bg-background focus-visible:ring-4 focus-visible:ring-brand/10 focus-visible:ring-offset-0"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          onFocus={() => setIsSearching(true)}
          onBlur={handleBlur}
        />
        <div className="absolute right-2 top-2.5 flex items-center gap-2">
          {isFetching && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          <button
            className="rounded-sm text-muted-foreground hover:text-foreground"
            onClick={() => {
              setSearchValue("");
              setIsSearching(false);
              ref.current?.blur();
            }}
          >
            {searchValue ? <X className="size-4" /> : <kbd className="rounded border bg-background px-1.5 font-sans text-[10px]">/</kbd>}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default SearchBar;
