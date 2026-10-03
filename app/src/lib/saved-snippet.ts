/** A captured caption as words: hashtag runs and extra whitespace removed. */
export function calmCaption(text: string): string {
  return (text ?? "").replace(/#[\p{L}\p{N}_]+/gu, " ").replace(/\s+/g, " ").trim();
}
