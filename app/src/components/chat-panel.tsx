"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import {
  X,
  Send,
  Trash2,
  Bot,
  User,
  CheckCircle2,
  Loader2,
  ClipboardPaste,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useChat, type ActionResult } from "@/lib/use-chat";

function ActionBadge({ result }: { result: ActionResult }) {
  const failed = result.summary.startsWith("Failed");
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{
        background: failed ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)",
        color: failed ? "var(--color-danger)" : "var(--color-success)",
      }}
    >
      <CheckCircle2 size={10} />
      {result.summary}
    </span>
  );
}

export function ChatPanel() {
  const { chatPanelOpen, setChatPanelOpen } = useAppStore();
  const { messages, loading, sendMessage, clearMessages } = useChat();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  // Focus textarea when panel opens
  useEffect(() => {
    if (chatPanelOpen) {
      setTimeout(() => textareaRef.current?.focus(), 300);
    }
  }, [chatPanelOpen]);

  const handleSend = () => {
    if (!input.trim() || loading) return;
    sendMessage(input);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInput((prev) => prev + text);
        textareaRef.current?.focus();
      }
    } catch {
      textareaRef.current?.focus();
    }
  };

  return (
    <>
      {/* Backdrop */}
      {chatPanelOpen && (
        <div
          className="fixed inset-0 lg:hidden"
          style={{ background: "rgba(0,0,0,0.4)", zIndex: 45 }}
          onClick={() => setChatPanelOpen(false)}
        />
      )}

      {/* Panel */}
      <aside
        className="fixed top-0 right-0 h-screen flex flex-col transition-transform"
        style={{
          width: "min(400px, 100vw)",
          zIndex: 46,
          background: "var(--bg-secondary)",
          borderLeft: "1px solid var(--border-primary)",
          transitionDuration: "var(--duration-slow)",
          transform: chatPanelOpen ? "translateX(0)" : "translateX(100%)",
        }}
      >
        {/* Header */}
        <div
          className="flex h-14 items-center justify-between px-4 shrink-0"
          style={{ borderBottom: "1px solid var(--border-primary)" }}
        >
          <div className="flex items-center gap-2">
            <Bot size={18} style={{ color: "var(--accent)" }} />
            <span
              className="font-semibold text-sm"
              style={{ color: "var(--text-primary)" }}
            >
              Assistant
            </span>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={clearMessages}
                className="rounded-lg p-1.5 transition-colors"
                style={{ color: "var(--text-tertiary)" }}
                title="Clear conversation"
              >
                <Trash2 size={16} />
              </button>
            )}
            <button
              onClick={() => setChatPanelOpen(false)}
              className="rounded-lg p-1.5 transition-colors"
              style={{ color: "var(--text-tertiary)" }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {messages.length === 0 && !loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-4">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-xl"
                style={{ background: "var(--accent-bg)" }}
              >
                <Bot size={24} style={{ color: "var(--accent)" }} />
              </div>
              <p
                className="text-sm font-medium text-center"
                style={{ color: "var(--text-primary)" }}
              >
                Paste your notes or ask me anything
              </p>
              <p
                className="text-xs text-center"
                style={{ color: "var(--text-secondary)" }}
              >
                I&apos;ll extract tasks, goals, habits, and more from your text.
              </p>
              <div className="mt-2 flex flex-col gap-1.5 w-full">
                {[
                  "Paste my Notion page",
                  "Add a daily reading habit",
                  "Create a project for my brand",
                ].map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setInput(ex);
                      textareaRef.current?.focus();
                    }}
                    className="rounded-lg px-3 py-2 text-xs text-left transition-colors"
                    style={{
                      background: "var(--bg-tertiary)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      background:
                        msg.role === "user" ? "var(--accent)" : "var(--accent-bg)",
                    }}
                  >
                    {msg.role === "user" ? (
                      <User size={14} style={{ color: "white" }} />
                    ) : (
                      <Bot size={14} style={{ color: "var(--accent)" }} />
                    )}
                  </div>
                  <div
                    className={`flex flex-col gap-1.5 max-w-[85%] ${
                      msg.role === "user" ? "items-end" : ""
                    }`}
                  >
                    <div
                      className="rounded-xl px-3 py-2 text-xs leading-relaxed"
                      style={{
                        background:
                          msg.role === "user"
                            ? "var(--accent)"
                            : "var(--bg-tertiary)",
                        color:
                          msg.role === "user" ? "white" : "var(--text-primary)",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {msg.content}
                    </div>
                    {msg.actions && msg.actions.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {msg.actions.map((a, i) => (
                          <ActionBadge key={i} result={a} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex gap-2">
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: "var(--accent-bg)" }}
                  >
                    <Bot size={14} style={{ color: "var(--accent)" }} />
                  </div>
                  <div
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs"
                    style={{
                      background: "var(--bg-tertiary)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <Loader2
                      size={12}
                      className="animate-spin"
                      style={{ color: "var(--accent)" }}
                    />
                    Thinking...
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div
          className="shrink-0 flex items-end gap-2 px-3 py-3"
          style={{ borderTop: "1px solid var(--border-primary)" }}
        >
          <button
            onClick={handlePaste}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors"
            style={{
              background: "var(--bg-tertiary)",
              color: "var(--text-secondary)",
            }}
            title="Paste from clipboard"
          >
            <ClipboardPaste size={14} />
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Paste or type..."
            rows={1}
            className="flex-1 resize-none rounded-lg px-3 py-2 text-xs outline-none"
            style={{
              background: "var(--bg-tertiary)",
              color: "var(--text-primary)",
              maxHeight: 160,
              lineHeight: "1.5",
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors"
            style={{
              background: input.trim() && !loading ? "var(--accent)" : "var(--bg-tertiary)",
              color: input.trim() && !loading ? "white" : "var(--text-tertiary)",
              cursor: input.trim() && !loading ? "pointer" : "not-allowed",
            }}
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
