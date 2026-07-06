"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, onSnapshot, query, orderBy } from "@/lib/local-db";
import { db } from "./firebase";
import { contentIdeas as ideasApi, contentPosts as postsApi } from "./firestore";
import type { ContentIdea, ContentPost } from "./types";
import { useAuth } from "./auth-context";
import { SEED_IDEAS } from "./content-os";

let localIdCounter = 0;

export function useContentIdeas() {
  const { user, isFirebaseConfigured } = useAuth();
  const [ideas, setIdeas] = useState<ContentIdea[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured || !user || !db) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, `users/${user.uid}/contentIdeas`),
      orderBy("createdAt", "asc")
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map((doc) => {
        const d = doc.data();
        return {
          ...d,
          id: doc.id,
          createdAt: d.createdAt?.toDate?.() || new Date(),
          updatedAt: d.updatedAt?.toDate?.() || new Date(),
        } as ContentIdea;
      });
      setIdeas(data);
      setLoading(false);
    });

    return unsubscribe;
  }, [user, isFirebaseConfigured]);

  const createIdea = useCallback(
    async (data: Omit<ContentIdea, "id" | "createdAt" | "updatedAt">) => {
      const now = new Date();
      if (isFirebaseConfigured && user) {
        return await ideasApi.create(user.uid, { ...data, createdAt: now, updatedAt: now });
      }
      const idea: ContentIdea = { ...data, id: `local-idea-${++localIdCounter}`, createdAt: now, updatedAt: now };
      setIdeas((prev) => [...prev, idea]);
      return idea.id;
    },
    [user, isFirebaseConfigured]
  );

  const updateIdea = useCallback(
    async (id: string, data: Partial<ContentIdea>) => {
      const patch = { ...data, updatedAt: new Date() };
      if (isFirebaseConfigured && user) {
        await ideasApi.update(user.uid, id, patch);
      } else {
        setIdeas((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
      }
    },
    [user, isFirebaseConfigured]
  );

  const deleteIdea = useCallback(
    async (id: string) => {
      if (isFirebaseConfigured && user) {
        await ideasApi.delete(user.uid, id);
      } else {
        setIdeas((prev) => prev.filter((i) => i.id !== id));
      }
    },
    [user, isFirebaseConfigured]
  );

  // One-shot import of the 60 starter ideas from the vault's idea bank.
  const seedIdeas = useCallback(async () => {
    const now = new Date();
    for (const [i, seed] of SEED_IDEAS.entries()) {
      // Stagger createdAt so orderBy(createdAt) preserves vault order.
      const at = new Date(now.getTime() + i);
      if (isFirebaseConfigured && user) {
        await ideasApi.create(user.uid, { ...seed, status: "idea", createdAt: at, updatedAt: at });
      } else {
        setIdeas((prev) => [
          ...prev,
          { ...seed, status: "idea", id: `local-idea-${++localIdCounter}`, createdAt: at, updatedAt: at },
        ]);
      }
    }
  }, [user, isFirebaseConfigured]);

  return { ideas, loading, createIdea, updateIdea, deleteIdea, seedIdeas };
}

export function useContentPosts() {
  const { user, isFirebaseConfigured } = useAuth();
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured || !user || !db) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, `users/${user.uid}/contentPosts`),
      orderBy("date", "desc")
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map((doc) => {
        const d = doc.data();
        return {
          ...d,
          id: doc.id,
          createdAt: d.createdAt?.toDate?.() || new Date(),
          updatedAt: d.updatedAt?.toDate?.() || new Date(),
        } as ContentPost;
      });
      setPosts(data);
      setLoading(false);
    });

    return unsubscribe;
  }, [user, isFirebaseConfigured]);

  const createPost = useCallback(
    async (data: Omit<ContentPost, "id" | "createdAt" | "updatedAt">) => {
      const now = new Date();
      if (isFirebaseConfigured && user) {
        return await postsApi.create(user.uid, { ...data, createdAt: now, updatedAt: now });
      }
      const post: ContentPost = { ...data, id: `local-post-${++localIdCounter}`, createdAt: now, updatedAt: now };
      setPosts((prev) => [post, ...prev]);
      return post.id;
    },
    [user, isFirebaseConfigured]
  );

  const updatePost = useCallback(
    async (id: string, data: Partial<ContentPost>) => {
      const patch = { ...data, updatedAt: new Date() };
      if (isFirebaseConfigured && user) {
        await postsApi.update(user.uid, id, patch);
      } else {
        setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
      }
    },
    [user, isFirebaseConfigured]
  );

  const deletePost = useCallback(
    async (id: string) => {
      if (isFirebaseConfigured && user) {
        await postsApi.delete(user.uid, id);
      } else {
        setPosts((prev) => prev.filter((p) => p.id !== id));
      }
    },
    [user, isFirebaseConfigured]
  );

  return { posts, loading, createPost, updatePost, deletePost };
}
