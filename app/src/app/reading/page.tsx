"use client";

import { useState } from "react";
import {
  BookMarked,
  Plus,
  Star,
  X,
  BookOpen,
  BookCheck,
  Bookmark,
  Trash2,
} from "lucide-react";
import { useBooks } from "@/lib/use-books";
import type { BookStatus } from "@/lib/types";

const STATUS_CONFIG: Record<
  BookStatus,
  { label: string; icon: typeof BookOpen; color: string }
> = {
  reading: { label: "Currently Reading", icon: BookOpen, color: "#10B981" },
  want_to_read: { label: "Want to Read", icon: Bookmark, color: "#3B82F6" },
  finished: { label: "Finished", icon: BookCheck, color: "#8B5CF6" },
  abandoned: { label: "Abandoned", icon: X, color: "#94A3B8" },
};

export default function ReadingPage() {
  const {
    books,
    reading,
    wantToRead,
    finished,
    booksThisYear,
    loading,
    createBook,
    updateBook,
    deleteBook,
  } = useBooks();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [totalPages, setTotalPages] = useState("");
  const [status, setStatus] = useState<BookStatus>("want_to_read");

  const handleSubmit = async () => {
    if (!title.trim()) return;
    await createBook({
      title: title.trim(),
      author: author.trim(),
      status,
      totalPages: totalPages ? parseInt(totalPages) : undefined,
      currentPage: 0,
      startDate: status === "reading" ? new Date() : undefined,
    });
    setTitle("");
    setAuthor("");
    setTotalPages("");
    setStatus("want_to_read");
    setShowForm(false);
  };

  const updateProgress = async (id: string, page: number, total?: number) => {
    const updates: Partial<{ currentPage: number; status: BookStatus; finishDate: Date }> = {
      currentPage: page,
    };
    if (total && page >= total) {
      updates.status = "finished";
      updates.finishDate = new Date();
    }
    await updateBook(id, updates);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <BookMarked size={24} style={{ color: "#8B5CF6" }} />
          <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Reading
          </h1>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
        >
          <Plus size={16} />
          Add Book
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div
          className="rounded-xl p-4 text-center"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
        >
          <p className="text-2xl font-bold font-mono" style={{ color: "#10B981" }}>
            {reading.length}
          </p>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Reading</p>
        </div>
        <div
          className="rounded-xl p-4 text-center"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
        >
          <p className="text-2xl font-bold font-mono" style={{ color: "#8B5CF6" }}>
            {booksThisYear.length}
          </p>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>This year</p>
        </div>
        <div
          className="rounded-xl p-4 text-center"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
        >
          <p className="text-2xl font-bold font-mono" style={{ color: "#3B82F6" }}>
            {wantToRead.length}
          </p>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>To read</p>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div
          className="rounded-xl p-5 mb-6"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--accent)" }}
        >
          <div className="space-y-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Book title..."
              autoFocus
              className="w-full text-base font-medium bg-transparent outline-none"
              style={{ color: "var(--text-primary)" }}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Author..."
              className="w-full text-sm bg-transparent outline-none"
              style={{ color: "var(--text-secondary)" }}
            />
            <div className="flex gap-2">
              <input
                type="number"
                value={totalPages}
                onChange={(e) => setTotalPages(e.target.value)}
                placeholder="Pages"
                className="w-24 text-xs rounded-lg px-3 py-2 outline-none"
                style={{
                  background: "var(--bg-tertiary)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-primary)",
                }}
              />
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as BookStatus)}
                className="text-xs rounded-lg px-3 py-2 outline-none"
                style={{
                  background: "var(--bg-tertiary)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-primary)",
                }}
              >
                <option value="want_to_read">Want to Read</option>
                <option value="reading">Currently Reading</option>
                <option value="finished">Finished</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowForm(false)} className="text-sm px-3 py-1.5" style={{ color: "var(--text-secondary)" }}>
              Cancel
            </button>
            <button onClick={handleSubmit} className="text-sm px-4 py-1.5 rounded-lg bg-emerald-500 text-white font-medium">
              Add Book
            </button>
          </div>
        </div>
      )}

      {/* Currently Reading */}
      {reading.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold mb-3" style={{ color: "#10B981" }}>
            Currently Reading
          </h2>
          <div className="space-y-3">
            {reading.map((book) => {
              const progress = book.totalPages && book.currentPage
                ? Math.round((book.currentPage / book.totalPages) * 100)
                : 0;
              return (
                <div
                  key={book.id}
                  className="group rounded-xl p-4"
                  style={{
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border-primary)",
                    borderLeft: "3px solid #10B981",
                  }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                        {book.title}
                      </h3>
                      <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                        {book.author}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteBook(book.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {book.totalPages && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                          Page {book.currentPage || 0} of {book.totalPages}
                        </span>
                        <span className="text-xs font-mono" style={{ color: "#10B981" }}>
                          {progress}%
                        </span>
                      </div>
                      <div
                        className="h-2 rounded-full overflow-hidden"
                        style={{ background: "var(--bg-tertiary)" }}
                      >
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${progress}%`, background: "#10B981" }}
                        />
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={book.totalPages}
                        value={book.currentPage || 0}
                        onChange={(e) =>
                          updateProgress(book.id, parseInt(e.target.value), book.totalPages)
                        }
                        className="w-full mt-2 h-1 appearance-none cursor-pointer"
                        style={{ accentColor: "#10B981" }}
                      />
                    </div>
                  )}
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => updateBook(book.id, { status: "finished", finishDate: new Date() })}
                      className="text-xs px-2 py-1 rounded"
                      style={{ color: "#8B5CF6" }}
                    >
                      Mark Finished
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Want to Read */}
      {wantToRead.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold mb-3" style={{ color: "#3B82F6" }}>
            Want to Read ({wantToRead.length})
          </h2>
          <div className="space-y-2">
            {wantToRead.map((book) => (
              <div
                key={book.id}
                className="group flex items-center gap-3 rounded-lg px-4 py-3"
                style={{
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-primary)",
                }}
              >
                <Bookmark size={16} style={{ color: "#3B82F6" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                    {book.title}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {book.author}
                  </p>
                </div>
                <button
                  onClick={() => updateBook(book.id, { status: "reading", startDate: new Date() })}
                  className="text-xs px-2 py-1 rounded shrink-0"
                  style={{ color: "#10B981" }}
                >
                  Start
                </button>
                <button
                  onClick={() => deleteBook(book.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 shrink-0"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Finished */}
      {finished.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-3" style={{ color: "#8B5CF6" }}>
            Finished ({finished.length})
          </h2>
          <div className="space-y-2">
            {finished.map((book) => (
              <div
                key={book.id}
                className="group flex items-center gap-3 rounded-lg px-4 py-3"
                style={{
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-primary)",
                  opacity: 0.8,
                }}
              >
                <BookCheck size={16} style={{ color: "#8B5CF6" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                    {book.title}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {book.author}
                    {book.finishDate && (
                      <> &middot; {new Date(book.finishDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</>
                    )}
                  </p>
                </div>
                {book.rating && (
                  <span className="flex items-center gap-0.5 text-xs shrink-0" style={{ color: "#F59E0B" }}>
                    <Star size={10} fill="#F59E0B" />
                    {book.rating}
                  </span>
                )}
                <button
                  onClick={() => deleteBook(book.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 shrink-0"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {books.length === 0 && !loading && (
        <div
          className="rounded-xl p-8 text-center"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
        >
          <BookMarked size={32} style={{ color: "var(--text-tertiary)" }} className="mx-auto mb-3" />
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            No books yet. Ali Abdaal recommends reading at least one book per month!
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
            Tap &quot;Add Book&quot; to start tracking your reading.
          </p>
        </div>
      )}
    </div>
  );
}
