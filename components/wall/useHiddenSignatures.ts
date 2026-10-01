"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

// Hidden messages are a per-browser moderation list. They stay on chain; this laptop just
// stops showing them. Memory is the source of truth so hiding works even when storage is
// blocked; localStorage keeps it across refreshes and syncs other tabs of the same wall.

const memory = new Map<string, string>();
const listeners = new Set<() => void>();
const EMPTY = "[]";

const storageKey = (ref: string) => `shoutout-wall:hidden:${ref}`;

function read(ref: string): string {
  let value = memory.get(ref);
  if (value === undefined) {
    try {
      value = window.localStorage.getItem(storageKey(ref)) ?? EMPTY;
    } catch {
      value = EMPTY;
    }
    memory.set(ref, value);
  }
  return value;
}

function write(ref: string, value: string) {
  memory.set(ref, value);
  try {
    window.localStorage.setItem(storageKey(ref), value);
  } catch {
    // Private mode or blocked storage: keep it for this session only.
  }
  listeners.forEach((listener) => listener());
}

export function useHiddenSignatures(ref: string) {
  const raw = useSyncExternalStore(
    (onChange) => {
      const onStorage = (event: StorageEvent) => {
        if (event.key !== storageKey(ref)) return;
        memory.set(ref, event.newValue ?? EMPTY);
        onChange();
      };
      listeners.add(onChange);
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(onChange);
        window.removeEventListener("storage", onStorage);
      };
    },
    () => read(ref),
    () => EMPTY,
  );

  const hidden = useMemo(() => {
    try {
      const list: unknown = JSON.parse(raw);
      return new Set(Array.isArray(list) ? list.filter((s): s is string => typeof s === "string") : []);
    } catch {
      return new Set<string>();
    }
  }, [raw]);

  const hide = useCallback(
    (signature: string) => write(ref, JSON.stringify([...hidden, signature])),
    [hidden, ref],
  );
  const restoreAll = useCallback(() => write(ref, EMPTY), [ref]);

  return { hidden, hide, restoreAll };
}
