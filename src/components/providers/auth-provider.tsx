"use client";

import { onAuthStateChanged, signOut as fbSignOut, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/client/api";
import type { Workspace } from "@/lib/domain/types";
import { firebase } from "@/lib/firebase/client";

interface AuthState {
  user: User | null;
  ready: boolean;
  workspaceId: string | null;
  workspace: Workspace | null;
  /** Set when the browser can't read the user's data (e.g. security rules deny it). */
  dataError: string | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
const DATA_TIMEOUT_MS = 15_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    const { auth } = firebase();
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setReady(true);
      if (!u) {
        setWorkspaceId(null);
        setWorkspace(null);
      }
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    const { db } = firebase();
    // Firestore doesn't report a stalled connection; it just never answers. Don't wait forever.
    const watchdog = setTimeout(() => setDataError((e) => e ?? "unreachable"), DATA_TIMEOUT_MS);
    const unsubscribe = onSnapshot(
      doc(db, `users/${user.uid}`),
      (snap) => {
        clearTimeout(watchdog);
        setDataError(null);
        setWorkspaceId((snap.get("defaultWorkspaceId") as string) ?? null);
      },
      (err) => {
        clearTimeout(watchdog);
        setWorkspaceId(null);
        setDataError(err.code === "permission-denied" ? "permission-denied" : err.message);
      },
    );
    return () => {
      clearTimeout(watchdog);
      unsubscribe();
    };
  }, [user]);

  useEffect(() => {
    if (!workspaceId) return;
    const { db } = firebase();
    return onSnapshot(
      doc(db, `workspaces/${workspaceId}`),
      (snap) => setWorkspace((snap.data() as Workspace) ?? null),
      (err) => setDataError(err.code === "permission-denied" ? "permission-denied" : err.message),
    );
  }, [workspaceId]);

  const signOut = useCallback(async () => {
    await api("/api/session", { method: "DELETE" }).catch(() => undefined);
    await fbSignOut(firebase().auth);
    router.replace("/login");
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, ready, workspaceId, workspace, dataError, signOut }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** Workspace-scoped collection path, or null until the workspace is known. */
export function useWsPath(sub: string) {
  const { workspaceId } = useAuth();
  return workspaceId ? `workspaces/${workspaceId}/${sub}` : null;
}
