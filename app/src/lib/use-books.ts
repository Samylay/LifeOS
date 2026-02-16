"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "./firebase";
import { books as booksApi } from "./firestore";
import type { Book, BookStatus } from "./types";
import { useAuth } from "./auth-context";

let localIdCounter = 0;

export function useBooks() {
  const { user, isFirebaseConfigured } = useAuth();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured || !user || !db) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, `users/${user.uid}/books`),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const items = snap.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          startDate: data.startDate?.toDate?.() || undefined,
          finishDate: data.finishDate?.toDate?.() || undefined,
          createdAt: data.createdAt?.toDate?.() || new Date(),
        } as Book;
      });
      setBooks(items);
      setLoading(false);
    });

    return unsubscribe;
  }, [user, isFirebaseConfigured]);

  const createBook = useCallback(
    async (data: Omit<Book, "id" | "createdAt">) => {
      const now = new Date();
      if (isFirebaseConfigured && user) {
        return await booksApi.create(user.uid, { ...data, createdAt: now });
      } else {
        const book: Book = {
          ...data,
          id: `local-book-${++localIdCounter}`,
          createdAt: now,
        };
        setBooks((prev) => [book, ...prev]);
        return book.id;
      }
    },
    [user, isFirebaseConfigured]
  );

  const updateBook = useCallback(
    async (id: string, data: Partial<Book>) => {
      if (isFirebaseConfigured && user) {
        await booksApi.update(user.uid, id, data);
      } else {
        setBooks((prev) =>
          prev.map((b) => (b.id === id ? { ...b, ...data } : b))
        );
      }
    },
    [user, isFirebaseConfigured]
  );

  const deleteBook = useCallback(
    async (id: string) => {
      if (isFirebaseConfigured && user) {
        await booksApi.delete(user.uid, id);
      } else {
        setBooks((prev) => prev.filter((b) => b.id !== id));
      }
    },
    [user, isFirebaseConfigured]
  );

  const reading = books.filter((b) => b.status === "reading");
  const wantToRead = books.filter((b) => b.status === "want_to_read");
  const finished = books.filter((b) => b.status === "finished");

  const booksThisYear = finished.filter((b) => {
    if (!b.finishDate) return false;
    return new Date(b.finishDate).getFullYear() === new Date().getFullYear();
  });

  return {
    books,
    reading,
    wantToRead,
    finished,
    booksThisYear,
    loading,
    createBook,
    updateBook,
    deleteBook,
  };
}
