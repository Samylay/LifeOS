import { dirname, join } from "node:path";
import { WorkflowError } from "./store";
export function artifactDirectory() { return join(dirname(process.env.LIFEOS_DB_PATH || join(process.cwd(), "data/lifeos.db")), "workflow-artifacts"); }
export function sniffArtifact(bytes: Buffer, mime: string): { kind: "image" | "video" | "text"; mime: string } {
  if (mime === "image/png" && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return { kind: "image", mime };
  if (mime === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return { kind: "image", mime };
  if (mime === "image/webp" && bytes.toString("ascii",0,4) === "RIFF" && bytes.toString("ascii",8,12) === "WEBP") return { kind: "image", mime };
  if (mime === "video/mp4" && bytes.toString("ascii",4,8) === "ftyp") return { kind: "video", mime };
  if (mime === "video/webm" && bytes.subarray(0,4).equals(Buffer.from([26,69,223,163]))) return { kind: "video", mime };
  if (mime === "text/plain" && !bytes.includes(0)) return { kind: "text", mime };
  throw new WorkflowError("Supported artifacts: PNG, JPEG, WebP, MP4, WebM, plain text");
}
