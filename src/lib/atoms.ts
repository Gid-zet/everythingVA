import { atom } from "jotai";

// Search-related atoms
export const isSearchingAtom = atom(false);
export const searchValueAtom = atom("");
/** Debounced Gmail-style filter applied to the thread list (from:, is:unread…). */
export const threadQueryAtom = atom("");

// Thread-related atoms
export const threadIdAtom = atom<string | undefined>(undefined);

// Visual mode atoms
export const visualModeAtom = atom(false);
export const visualModeStartIdAtom = atom<string | null>(null);
