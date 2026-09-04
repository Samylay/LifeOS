"use client";

// The content catalog: types and hook formulas Samy owns and edits
// (T-content-rework-03). Seeds itself once from the constants that used to be
// the whole playbook, so the catalog starts populated and nothing he has
// written is invalidated by the move.
import { useCallback, useEffect, useRef } from "react";
import { useCollection } from "./use-collection";
import {
  seedContentTypes,
  seedHookFormulas,
  sortTypes,
  type ContentType,
  type HookFormula,
} from "./content/catalog";

export function useContentCatalog() {
  const types = useCollection<ContentType & { id: string }>("contentTypes", {
    orderByField: "order",
    orderDir: "asc",
  });
  const hooks = useCollection<HookFormula & { id: string }>("hookFormulas", {
    orderByField: "n",
    orderDir: "asc",
  });

  // Seed once, and only into a genuinely empty collection — never top up, or
  // a type Samy deleted on purpose would reappear every load.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || types.loading || hooks.loading) return;
    if (types.items.length > 0 || hooks.items.length > 0) {
      seeded.current = true;
      return;
    }
    seeded.current = true;
    void Promise.all([
      ...seedContentTypes().map((t) => types.create(t)),
      ...seedHookFormulas().map((h) => hooks.create(h)),
    ]).catch(() => {
      seeded.current = false;
    });
    // types/hooks identities change every render; the guard above is what
    // makes this run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [types.loading, hooks.loading, types.items.length, hooks.items.length]);

  const addType = useCallback(
    (t: Omit<ContentType, "id">) => types.create(t),
    [types],
  );
  const updateType = useCallback(
    (id: string, patch: Partial<ContentType>) => types.update(id, patch),
    [types],
  );
  const addHook = useCallback(
    (h: Omit<HookFormula, "id">) => hooks.create(h),
    [hooks],
  );
  const updateHook = useCallback(
    (id: string, patch: Partial<HookFormula>) => hooks.update(id, patch),
    [hooks],
  );

  return {
    types: sortTypes(types.items),
    hooks: hooks.items,
    loading: types.loading || hooks.loading,
    addType,
    updateType,
    addHook,
    updateHook,
    removeType: types.remove,
    removeHook: hooks.remove,
  };
}
