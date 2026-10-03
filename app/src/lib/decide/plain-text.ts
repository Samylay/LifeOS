/** Turn markdown-ish source text into words a person reads in a list or a heading. */
export function plainTitle(text: string): string {
  return (text ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[`*_~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The first sentence-sized slice of a longer request, for when there is no brief. */
export function excerpt(text: string, max = 240): string {
  const plain = plainTitle(text);
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "), cut.lastIndexOf(" — "));
  return `${(stop > max * 0.5 ? cut.slice(0, stop + 1) : cut.slice(0, cut.lastIndexOf(" "))).trim()}…`;
}
