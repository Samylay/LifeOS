/** Validate chat input without changing the message that will be processed. */
export function validateChatInput(content: string): string | null {
  return content.trim() ? content : null;
}
