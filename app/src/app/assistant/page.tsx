"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import {
  Send,
  Trash2,
  Bot,
  User,
  CheckCircle2,
  Loader2,
  Sparkles,
  ClipboardPaste,
} from "lucide-react";
import { useChat, type ActionResult } from "@/lib/use-chat";

function ActionBadge({ result }: { result: ActionResult }) {
  const iconColor =
    result.summary.startsWith("Failed") ? "var(--color-danger)" : "var(--color-success)";

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{
        background: result.summary.startsWith("Failed")
          ? "rgba(239, 68, 68, 0.1)"
          : "rgba(16, 185, 129, 0.1)",
        color: iconColor,
      }}
    >
      <CheckCircle2 size={12} />
      {result.summary}
    </span>
  );
}

export default function AssistantPage() {
  const { messages, loading, sendMessage, clearMessages } = useChat();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, [input]);

  const handleSend = () => {
    if (!input.trim() || loading) return;
    sendMessage(input);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
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
      // Clipboard API may not be available
      textareaRef.current?.focus();
    }
  };

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 120px)" }}>
      {/* Header */}
      <div
        className="flex items-center justify-between rounded-xl p-4 mb-4"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-primary)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ background: "var(--accent-bg)" }}
          >
            <Sparkles size={20} style={{ color: "var(--accent)" }} />
          </div>
          <div>
            <h1
              className="text-lg font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Assistant
            </h1>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Paste anything &mdash; I&apos;ll extract tasks, goals, habits &amp; more
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearMessages}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              color: "var(--text-secondary)",
              background: "var(--bg-tertiary)",
            }}
            title="Clear conversation"
          >
            <Trash2 size={14} />
            Clear
          </button>
        )}
      </div>

      {/* Messages area */}
      <div
        className="flex-1 overflow-y-auto rounded-xl p-4"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-primary)",
        }}
      >
        {messages.length === 0 && !loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-2xl"
              style={{ background: "var(--accent-bg)" }}
            >
              <Bot size={32} style={{ color: "var(--accent)" }} />
            </div>
            <div className="text-center">
              <p
                className="text-base font-medium mb-1"
                style={{ color: "var(--text-primary)" }}
              >
                Paste your notes, todos, or brain dumps
              </p>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                I&apos;ll parse them and add tasks, goals, habits, projects, and
                reminders to your LifeOS automatically.
              </p>
            </div>
            <div
              className="mt-2 grid gap-2 text-xs max-w-md w-full"
              style={{ color: "var(--text-secondary)" }}
            >
              {[
                "Paste a Notion page and I'll extract all the todos",
                "\"Add a habit to do 30 min of reading daily\"",
                "\"Create a project for my personal brand with tasks\"",
                "Dump your meeting notes and I'll find the action items",
              ].map((example, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setInput(example.replace(/^"|"$/g, ""));
                    textareaRef.current?.focus();
                  }}
                  className="rounded-lg px-3 py-2 text-left transition-colors"
                  style={{
                    background: "var(--bg-tertiary)",
                    color: "var(--text-secondary)",
                  }}
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${
                  msg.role === "user" ? "flex-row-reverse" : ""
                }`}
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    background:
                      msg.role === "user"
                        ? "var(--accent)"
                        : "var(--accent-bg)",
                  }}
                >
                  {msg.role === "user" ? (
                    <User size={16} style={{ color: "white" }} />
                  ) : (
                    <Bot
                      size={16}
                      style={{ color: "var(--accent)" }}
                    />
                  )}
                </div>
                <div
                  className={`flex flex-col gap-2 max-w-[80%] ${
                    msg.role === "user" ? "items-end" : ""
                  }`}
                >
                  <div
                    className="rounded-xl px-4 py-2.5 text-sm leading-relaxed"
                    style={{
                      background:
                        msg.role === "user"
                          ? "var(--accent)"
                          : "var(--bg-tertiary)",
                      color:
                        msg.role === "user"
                          ? "white"
                          : "var(--text-primary)",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {msg.content}
                  </div>
                  {msg.actions && msg.actions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {msg.actions.map((action, i) => (
                        <ActionBadge key={i} result={action} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-3">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: "var(--accent-bg)" }}
                >
                  <Bot size={16} style={{ color: "var(--accent)" }} />
                </div>
                <div
                  className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm"
                  style={{
                    background: "var(--bg-tertiary)",
                    color: "var(--text-secondary)",
                  }}
                >
                  <Loader2
                    size={14}
                    className="animate-spin"
                    style={{ color: "var(--accent)" }}
                  />
                  Thinking...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div
        className="mt-4 flex items-end gap-2 rounded-xl p-3"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-primary)",
        }}
      >
        <button
          onClick={handlePaste}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors"
          style={{
            background: "var(--bg-tertiary)",
            color: "var(--text-secondary)",
          }}
          title="Paste from clipboard"
        >
          <ClipboardPaste size={16} />
        </button>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Paste your notes, or type a message..."
          rows={1}
          className="flex-1 resize-none rounded-lg px-3 py-2 text-sm outline-none"
          style={{
            background: "var(--bg-tertiary)",
            color: "var(--text-primary)",
            maxHeight: 200,
            lineHeight: "1.5",
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors"
          style={{
            background: input.trim() && !loading ? "var(--accent)" : "var(--bg-tertiary)",
            color: input.trim() && !loading ? "white" : "var(--text-tertiary)",
            cursor: input.trim() && !loading ? "pointer" : "not-allowed",
          }}
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Send size={16} />
          )}
        </button>
      </div>
    </div>
  );
}
