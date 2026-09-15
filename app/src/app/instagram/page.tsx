"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, ChevronLeft, ExternalLink, Image as ImageIcon, LoaderCircle, MessageCircle, RefreshCw, Search, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Page, PageHeader, SectionHeader } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";
import type { InstagramConversation, InstagramMessage, InstagramOverview, InstagramPost, InstagramRecord, InstagramRecordKind } from "@/lib/instagram-export";

type Tab = "overview" | "conversations" | "activity" | "posts";

const TABS: Array<{ id: Tab; label: string; icon: typeof Archive }> = [
  { id: "overview", label: "Overview", icon: Archive },
  { id: "conversations", label: "Conversations", icon: MessageCircle },
  { id: "activity", label: "Activity", icon: Search },
  { id: "posts", label: "Posts", icon: ImageIcon },
];

const RECORD_KINDS: Array<{ id: InstagramRecordKind; label: string }> = [
  { id: "saved", label: "Saved" },
  { id: "liked", label: "Liked" },
  { id: "searches", label: "Searches" },
  { id: "links", label: "Links" },
  { id: "followers", label: "Followers" },
  { id: "following", label: "Following" },
];

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}

function LoadingCards() {
  return <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}</div>;
}

function ErrorCard({ error, retry }: { error: string; retry: () => void }) {
  return <Card className="items-center gap-3 p-8 text-center">
    <p className="text-sm text-muted-foreground">{error}</p>
    <Button onClick={retry} variant="secondary" size="sm" className="gap-2"><RefreshCw size={14} /> Try again</Button>
  </Card>;
}

function SearchField({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <div className="relative max-w-md">
    <Search aria-hidden size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
    <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="pl-9" />
  </div>;
}

function useDebouncedValue(value: string, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

function Overview({ data }: { data: InstagramOverview }) {
  const tiles = [
    ["Conversations", data.counts.conversations, MessageCircle],
    ["Your posts", data.counts.posts, ImageIcon],
    ["Saved posts", data.counts.saved, Archive],
    ["Liked posts", data.counts.liked, Archive],
    ["Profile searches", data.counts.searches, Search],
    ["Connections", (data.counts.followers ?? 0) + (data.counts.following ?? 0), Users],
  ] as const;
  return <>
    <Card className="gap-3 border-primary/25 bg-primary/5 p-4 sm:flex-row sm:items-start">
      <ShieldCheck className="mt-0.5 shrink-0 text-primary" size={18} />
      <div className="min-w-0"><p className="text-sm font-medium">Read-only local archive</p><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Nothing here is copied into LifeOS or written to its database. Message text is loaded only when you open a conversation.</p></div>
    </Card>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tiles.map(([label, count, Icon], index) => <Card key={label} className="enter gap-2 p-4" style={{ ["--enter-delay" as string]: `${index * 35}ms` }}>
        <Icon size={16} className="text-primary" /><p className="text-2xl font-semibold tracking-tight">{count === null ? "On demand" : count.toLocaleString()}</p><p className="text-sm text-muted-foreground">{label}</p>
      </Card>)}
    </div>
    {data.exportGeneratedAt && <p className="mt-4 text-xs text-muted-foreground">Export generated {new Date(data.exportGeneratedAt).toLocaleString()}.</p>}
  </>;
}

export default function InstagramArchivePage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<InstagramOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [conversationQuery, setConversationQuery] = useState("");
  const debouncedConversationQuery = useDebouncedValue(conversationQuery);
  const [conversations, setConversations] = useState<InstagramConversation[]>([]);
  const [conversationsTotal, setConversationsTotal] = useState(0);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<{ title: string; messages: InstagramMessage[] } | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [activityKind, setActivityKind] = useState<InstagramRecordKind>("saved");
  const [activityQuery, setActivityQuery] = useState("");
  const debouncedActivityQuery = useDebouncedValue(activityQuery);
  const [records, setRecords] = useState<InstagramRecord[]>([]);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [posts, setPosts] = useState<InstagramPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const loadOverview = useCallback(() => {
    setLoadingOverview(true); setOverviewError(null);
    void getJson<InstagramOverview>("/api/instagram").then(setOverview).catch((error: Error) => setOverviewError(error.message)).finally(() => setLoadingOverview(false));
  }, []);
  const loadConversations = useCallback(() => {
    setLoadingConversations(true); setConversationError(null);
    void getJson<{ items: InstagramConversation[]; total: number }>(`/api/instagram?view=conversations&q=${encodeURIComponent(debouncedConversationQuery)}`)
      .then((data) => { setConversations(data.items); setConversationsTotal(data.total); })
      .catch((error: Error) => setConversationError(error.message)).finally(() => setLoadingConversations(false));
  }, [debouncedConversationQuery]);
  const loadRecords = useCallback(() => {
    setLoadingRecords(true); setRecordError(null);
    void getJson<{ items: InstagramRecord[]; total: number }>(`/api/instagram?view=records&kind=${activityKind}&q=${encodeURIComponent(debouncedActivityQuery)}`)
      .then((data) => { setRecords(data.items); setRecordsTotal(data.total); })
      .catch((error: Error) => setRecordError(error.message)).finally(() => setLoadingRecords(false));
  }, [activityKind, debouncedActivityQuery]);
  const loadPosts = useCallback(() => {
    setLoadingPosts(true); setPostError(null);
    void getJson<{ items: InstagramPost[] }>("/api/instagram?view=posts").then((data) => setPosts(data.items)).catch((error: Error) => setPostError(error.message)).finally(() => setLoadingPosts(false));
  }, []);

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => { if (tab === "conversations") loadConversations(); }, [tab, loadConversations]);
  useEffect(() => { if (tab === "activity") loadRecords(); }, [tab, loadRecords]);
  useEffect(() => { if (tab === "posts") loadPosts(); }, [tab, loadPosts]);

  const openConversation = (conversation: InstagramConversation) => {
    setLoadingMessages(true); setConversationError(null);
    void getJson<{ title: string; messages: InstagramMessage[] }>(`/api/instagram?view=conversation&id=${encodeURIComponent(conversation.id)}`)
      .then(setSelectedConversation).catch((error: Error) => setConversationError(error.message)).finally(() => setLoadingMessages(false));
  };

  return <Page>
    <PageHeader kicker="Private archive" title="Instagram" icon={Archive} description="Browse this local export without importing, publishing, or changing it." />
    <div className="mb-5 flex flex-wrap gap-1 rounded-xl border border-border bg-muted/50 p-1">
      {TABS.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => { setTab(id); setSelectedConversation(null); }} aria-pressed={tab === id} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 active:scale-[0.97] ${tab === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><Icon size={15} />{label}</button>)}
    </div>

    {tab === "overview" && (loadingOverview ? <LoadingCards /> : overviewError ? <ErrorCard error={overviewError} retry={loadOverview} /> : !overview?.available ? <ErrorCard error="The local Instagram export is not mounted for this LifeOS instance." retry={loadOverview} /> : <Overview data={overview} />)}

    {tab === "conversations" && <section className="space-y-4 enter">
      {selectedConversation ? <>
        <Button variant="ghost" size="sm" onClick={() => setSelectedConversation(null)} className="gap-1.5"><ChevronLeft size={15} /> All conversations</Button>
        <SectionHeader title={selectedConversation.title} description="Showing the most recent exported messages. This text stays in the archive and is not indexed by LifeOS." />
        <div className="space-y-2">{selectedConversation.messages.length === 0 ? <Card className="p-5 text-sm text-muted-foreground">No readable messages were found in this export file.</Card> : selectedConversation.messages.map((message, index) => <Card key={`${message.timestamp}-${index}`} className="gap-1.5 p-3.5"><div className="flex items-baseline justify-between gap-3"><p className="text-sm font-medium">{message.sender}</p><p className="shrink-0 text-xs text-muted-foreground">{message.timestamp}</p></div><p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{message.text}</p></Card>)}</div>
      </> : <>
        <SectionHeader title="Conversations" description={conversationsTotal ? `${conversationsTotal.toLocaleString()} matching conversations. Search names only, message text stays private until opened.` : "Search by conversation name."} />
        <SearchField value={conversationQuery} onChange={setConversationQuery} placeholder="Search conversation names" />
        {loadingConversations || loadingMessages ? <LoadingCards /> : conversationError ? <ErrorCard error={conversationError} retry={loadConversations} /> : conversations.length === 0 ? <Card className="p-6 text-sm text-muted-foreground">No matching conversations.</Card> : <div className="grid gap-2 sm:grid-cols-2">{conversations.map((conversation) => <button key={conversation.id} type="button" onClick={() => openConversation(conversation)} className="flex min-h-16 items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md active:scale-[0.97]"><MessageCircle size={17} className="shrink-0 text-primary" /><span className="min-w-0 truncate text-sm font-medium">{conversation.title}</span></button>)}</div>}
      </>}
    </section>}

    {tab === "activity" && <section className="space-y-4 enter">
      <SectionHeader title="Activity records" description="Searchable local records. Large liked-post history is streamed from the export instead of imported." />
      <div className="flex flex-wrap gap-1">{RECORD_KINDS.map((kind) => <button key={kind.id} type="button" onClick={() => setActivityKind(kind.id)} aria-pressed={activityKind === kind.id} className={`rounded-full px-3 py-1.5 text-sm transition-colors duration-150 active:scale-[0.97] ${activityKind === kind.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{kind.label}</button>)}</div>
      <SearchField value={activityQuery} onChange={setActivityQuery} placeholder={`Search ${activityKind} records`} />
      {loadingRecords ? <LoadingCards /> : recordError ? <ErrorCard error={recordError} retry={loadRecords} /> : records.length === 0 ? <Card className="p-6 text-sm text-muted-foreground">No matching records.</Card> : <><p className="text-xs text-muted-foreground">{recordsTotal.toLocaleString()} match{recordsTotal === 1 ? "" : "es"}, showing the first {records.length}.</p><div className="space-y-2">{records.map((record, index) => <Card key={`${record.url}-${index}`} className="gap-1 p-3.5">{record.url ? <a href={record.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm font-medium transition-colors duration-150 hover:text-primary active:scale-[0.99]"><span className="min-w-0 flex-1 truncate">{record.title}</span><ExternalLink size={14} className="shrink-0" /></a> : <p className="text-sm font-medium">{record.title}</p>}{record.timestamp && <p className="text-xs text-muted-foreground">{record.timestamp}</p>}</Card>)}</div></>}
    </section>}

    {tab === "posts" && <section className="space-y-4 enter"><SectionHeader title="Your exported posts" description="Images are served only from the read-only archive." />{loadingPosts ? <LoadingCards /> : postError ? <ErrorCard error={postError} retry={loadPosts} /> : posts.length === 0 ? <Card className="p-6 text-sm text-muted-foreground">No exported posts were found.</Card> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{posts.map((post, index) => <Card key={post.path} className="enter overflow-hidden p-0" style={{ ["--enter-delay" as string]: `${index * 35}ms` }}><img src={`/api/instagram?view=media&path=${encodeURIComponent(post.path)}`} alt={post.caption || "Exported Instagram post"} className="aspect-square w-full bg-muted object-cover" /><div className="gap-1 p-3">{post.caption && <p className="line-clamp-2 text-sm">{post.caption}</p>}{post.timestamp && <p className="text-xs text-muted-foreground">{post.timestamp}</p>}</div></Card>)}</div>}</section>}
  </Page>;
}
