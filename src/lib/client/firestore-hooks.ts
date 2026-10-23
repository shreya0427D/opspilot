"use client";

import {
  collection,
  doc,
  onSnapshot,
  query,
  type QueryConstraint,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { firebase } from "@/lib/firebase/client";

export type WithId<T> = T & { id: string };

interface LiveState<T> {
  data: T;
  loading: boolean;
  error: string | null;
}

/**
 * Live subscription to a collection under the signed-in user's workspace. Reads are authorized
 * by Firestore security rules; `key` must change whenever the path or constraints change.
 */
export function useLiveCollection<T>(
  path: string | null,
  constraints: QueryConstraint[] = [],
  key = "",
): LiveState<WithId<T>[]> {
  const [state, setState] = useState<LiveState<WithId<T>[]>>({ data: [], loading: true, error: null });

  useEffect(() => {
    if (!path) return;
    const { db } = firebase();
    const q = query(collection(db, path), ...constraints);
    return onSnapshot(
      q,
      (snap) => setState({ data: snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) })), loading: false, error: null }),
      (err) => setState({ data: [], loading: false, error: err.message }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures constraint changes
  }, [path, key]);

  return path ? state : { data: [], loading: true, error: null };
}

export function useLiveDoc<T>(path: string | null): LiveState<WithId<T> | null> {
  const [state, setState] = useState<LiveState<WithId<T> | null>>({ data: null, loading: true, error: null });

  useEffect(() => {
    if (!path) return;
    const { db } = firebase();
    return onSnapshot(
      doc(db, path),
      (snap) => setState({ data: snap.exists() ? { id: snap.id, ...(snap.data() as T) } : null, loading: false, error: null }),
      (err) => setState({ data: null, loading: false, error: err.message }),
    );
  }, [path]);

  return path ? state : { data: null, loading: true, error: null };
}

export function toMillis(t: unknown): number | null {
  if (!t || typeof t !== "object") return null;
  if ("toMillis" in t && typeof (t as { toMillis: () => number }).toMillis === "function") return (t as { toMillis: () => number }).toMillis();
  if ("seconds" in t) return (t as { seconds: number }).seconds * 1000;
  return null;
}
