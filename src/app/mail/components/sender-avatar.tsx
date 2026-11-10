import { cn } from "@/lib/utils";

// A small set of tasteful hues; each sender always maps to the same one.
const HUES = [243, 262, 199, 173, 152, 32, 12, 340, 218, 286];

function hash(input: string) {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function initials(name: string) {
  const parts = name
    .replace(/<.*?>|["']/g, "")
    .trim()
    .split(/[\s@._-]+/)
    .filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function SenderAvatar({
  name,
  email,
  size = 32,
  className,
}: {
  name: string;
  email?: string | null;
  size?: number;
  className?: string;
}) {
  const hue = HUES[hash((email ?? name).toLowerCase()) % HUES.length];
  return (
    <span
      aria-hidden
      className={cn(
        "sender-avatar inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold ring-1 ring-inset ring-black/5 dark:ring-white/10",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        ["--h" as string]: hue,
      }}
    >
      {initials(name)}
    </span>
  );
}
