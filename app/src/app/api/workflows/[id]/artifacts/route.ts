import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { attachArtifact, authenticateReporter, WorkflowError } from "@/lib/workflows/store";
import { artifactDirectory, sniffArtifact } from "@/lib/workflows/artifacts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  let written: string | null = null;
  try {
    const { id } = await context.params;
    const token = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
    authenticateReporter(id, token);
    const size = Number(req.headers.get("content-length"));
    if (!Number.isFinite(size) || size <= 0 || size > 21 * 1024 * 1024) throw new WorkflowError("Upload requires Content-Length, maximum 20 MB per file", 413);
    const form = await req.formData(); const file = form.get("file");
    if (!(file instanceof File) || file.size > 20 * 1024 * 1024 || file.size === 0) throw new WorkflowError("A nonempty file up to 20 MB is required");
    const bytes = Buffer.from(await file.arrayBuffer());
    const format = sniffArtifact(bytes, file.type);
    const artifactId = randomUUID(); const folder = join(artifactDirectory(), id);
    await mkdir(folder, { recursive: true, mode: 0o700 });
    written = join(folder, artifactId);
    await writeFile(written, bytes, { flag: "wx", mode: 0o600 });
    const artifact = { id: artifactId, name: file.name.replace(/[\x00-\x1f]/g, "").slice(0, 120), ...format, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), href: `/api/workflows/${id}/artifacts/${artifactId}` };
    attachArtifact(id, token, artifact);
    return NextResponse.json({ artifact });
  } catch (error) {
    if (written) await unlink(written).catch(() => {});
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed" }, { status: error instanceof WorkflowError ? error.status : 400 });
  }
}
