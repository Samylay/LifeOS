"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

function safeHref(value: string) {
  const href = value.trim();
  return /^(https?:\/\/|mailto:)/i.test(href) ? href : null;
}

function inline(text: string, keyPrefix: string) {
  const tokens = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  const result: React.ReactNode[] = [];
  let offset = 0;
  let match: RegExpExecArray | null;
  while ((match = tokens.exec(text))) {
    if (match.index > offset) result.push(text.slice(offset, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${match.index}`;
    if (token.startsWith("`")) result.push(<code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">{token.slice(1, -1)}</code>);
    else if (token.startsWith("**")) result.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("*")) result.push(<em key={key}>{token.slice(1, -1)}</em>);
    else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      const href = link && safeHref(link[2]);
      result.push(link && href ? <a key={key} href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">{link[1]}</a> : token);
    }
    offset = match.index + token.length;
  }
  if (offset < text.length) result.push(text.slice(offset));
  return result;
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch { /* Clipboard access can be unavailable in insecure contexts. */ }
  };
  return <div className="my-3 overflow-hidden rounded-xl border border-border bg-background">
    <div className="flex h-9 items-center justify-between border-b border-border px-3 text-xs text-muted-foreground">
      <span>{language || "Code"}</span>
      <button type="button" onClick={() => void copy()} aria-label="Copy code" className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 hover:bg-muted active:scale-[0.97] transition-transform duration-150 ease-[var(--ease-out-custom)]">{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "Copied" : "Copy"}</button>
    </div>
    <pre className="overflow-x-auto p-3 text-[13px] leading-6"><code>{code}</code></pre>
  </div>;
}

export function ChatMarkdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    const fence = /^```([^`]*)$/.exec(line.trim());
    if (fence) {
      const code: string[] = [];
      index++;
      while (index < lines.length && !/^```\s*$/.test(lines[index].trim())) code.push(lines[index++]);
      if (index < lines.length) index++;
      blocks.push(<CodeBlock key={`code-${index}`} language={fence[1].trim()} code={code.join("\n")} />);
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const Tag = `h${heading[1].length + 1}` as "h2" | "h3" | "h4";
      blocks.push(<Tag key={`heading-${index}`} className="mt-4 font-semibold leading-6 first:mt-0">{inline(heading[2], `h-${index}`)}</Tag>);
      index++;
      continue;
    }
    const listMatch = /^\s*([-*+] |\d+\. )/.exec(line);
    if (listMatch) {
      const ordered = /^\s*\d+\. /.test(line);
      const items: React.ReactNode[] = [];
      while (index < lines.length && /^\s*(-[*+] |\d+\. )/.test(lines[index])) {
        const item = lines[index].replace(/^\s*(?:[-*+] |\d+\. )/, "");
        items.push(<li key={`li-${index}`}>{inline(item, `li-${index}`)}</li>);
        index++;
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(<List key={`list-${index}`} className={`my-2 space-y-1 pl-6 ${ordered ? "list-decimal" : "list-disc"}`}>{items}</List>);
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !/^```|^#{1,3}\s|^\s*([-*+] |\d+\. )/.test(lines[index])) paragraph.push(lines[index++]);
    blocks.push(<p key={`p-${index}`} className="whitespace-pre-wrap leading-7">{inline(paragraph.join("\n"), `p-${index}`)}</p>);
  }
  return <div className="chat-markdown space-y-2 text-[15px] text-foreground">{blocks}</div>;
}
