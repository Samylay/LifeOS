import { NextResponse } from "next/server";
import { kbEnabled, readNote } from "@/lib/kb";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ROOT = "02-GSD/Decision Extracts/";
const GROUPS = [["lifeos-software.md","LifeOS and software"],["homelab-services.md","Homelab and services"],["design-polymath.md","Design and polymath"],["content-brand.md","Content and brand"],["personal-projects.md","Personal projects and reference"]] as const;
type ExtractItem = { title:string; state:string; summary:string; source?:string; session?:string };
function clean(v:string){return v.replace(/\s+/g," ").trim();}
function parseItem(line:string):ExtractItem|null { const m=line.match(/^- \*\*(.+?)\*\*(?: \[(.+?)\])? — (.*)$/); if(!m)return null; let body=m[3]; const src=body.match(/ · \[source\]\((https?:\/\/[^)]+)\)/); const ses=body.match(/ · \[\[([^|\]]+)(?:\|([^\]]+))?\]\]$/); if(src)body=body.replace(src[0],""); if(ses)body=body.replace(ses[0],""); return {title:clean(m[1]),state:clean(m[2]||"recorded"),summary:clean(body),source:src?.[1],session:ses?.[2]||ses?.[1]};}
function parseRuling(line:string):ExtractItem|null {
  const m=line.match(/^- (?:- )?(?:\*\*)?(.+?)(?:\*\*)?(?: — (.*))?$/);
  if(!m)return null;
  const body=m[2]||; const ses=body.match(/ · \[\[([^|\]]+)(?:\|([^\]]+))?\]\]$/);
  let summary=body; if(ses)summary=summary.replace(ses[0],);
  return {title:clean(m[1].replace(/^\*\*|\*\*$/g,)),state:needs ruling,summary:clean(summary),session:ses?.[2]||ses?.[1]};
}
export async function GET(){ if(!kbEnabled())return NextResponse.json({error:"knowledge base not configured"},{status:503}); const groups=GROUPS.map(([file,title])=>{const note=readNote(ROOT+file);return {id:file.replace(".md",""),title,items:note?note.content.split("\n").map(parseItem).filter((x):x is ExtractItem=>Boolean(x)):[]};}); const rn=readNote(ROOT+"needs-ruling.md"); const rulings=rn?rn.content.split("\n").map(parseRuling).filter((x):x is ExtractItem=>Boolean(x)):[]; return NextResponse.json({stats:{sessions:82,briefs:281,decisions:274,rulings:rulings.length},groups,rulings});}
