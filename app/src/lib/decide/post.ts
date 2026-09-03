// The one client-side JSON POST the /decide surfaces share. Extracted after
// the 2026-09-03 review found it copied verbatim into three pages.
//
// It throws on both a non-2xx status and an `error` field in a 200 body,
// because several routes here report failure the second way — a helper that
// only checked the status would let those through as success.
export async function post(
  url: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(String(data.error ?? `HTTP ${res.status}`));
  return data;
}
