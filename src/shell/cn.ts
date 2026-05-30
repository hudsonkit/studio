/**
 * Minimal classname joiner. Filters falsy values; deduplication and
 * conflict resolution are deliberately not handled — pass `clsx` /
 * `tailwind-merge` from the consumer if needed.
 */
export function cn(...parts: Array<string | undefined | null | false>): string {
  return parts.filter(Boolean).join(" ");
}
