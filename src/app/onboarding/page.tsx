import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { adminDb } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/server/session";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Set up your workspace" };

export default async function OnboardingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/onboarding");
  if (!user.emailVerified) redirect("/verify-email");
  const existing = await adminDb().doc(`users/${user.uid}`).get();
  if (existing.get("defaultWorkspaceId")) redirect("/app");
  return <OnboardingForm email={user.email} />;
}
