import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { AuthProvider } from "@/components/providers/auth-provider";
import { adminDb } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/server/session";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/app");
  if (!user.emailVerified) redirect("/verify-email");
  const userDoc = await adminDb().doc(`users/${user.uid}`).get();
  if (!userDoc.get("defaultWorkspaceId")) redirect("/onboarding");

  return (
    <AuthProvider>
      <AppShell>{children}</AppShell>
    </AuthProvider>
  );
}
