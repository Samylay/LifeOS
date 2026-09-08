export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (typeof error === "object" && error !== null && "name" in error && (error as { name?: unknown }).name === "AbortError")
  );
}

/** Gives async search responses a monotonic identity so an older response can never paint over a newer query. */
export function createRequestGate() {
  let current = 0;
  return {
    start: () => ++current,
    isCurrent: (request: number) => request === current,
  };
}
