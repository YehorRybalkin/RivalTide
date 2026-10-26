import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { listMemberships } from "@/server/services/accounts";
import { Logo } from "@/components/brand/logo";
import { OnboardingOrgForm } from "@/components/app/onboarding-form";
import { OnboardingSteps } from "@/components/app/onboarding-steps";

export const metadata = { title: "Set up RivalTide" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const user = await requireUser();
  const { new: forceNew } = await searchParams;
  const { workspaces } = await listMemberships(user.id);
  if (workspaces.length > 0 && !forceNew) redirect(`/app/${workspaces[0]!.id}`);
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border"><div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6"><Link href="/"><Logo /></Link><span className="text-[13px] text-muted">{user.email}</span></div></header>
      <main className="mx-auto grid max-w-5xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[240px_1fr]">
        <OnboardingSteps current={1} />
        <div className="max-w-lg fade-in">
          <h1 className="text-2xl font-semibold tracking-tight">Create your organization</h1>
          <p className="mt-1 text-[14px] text-muted">An organization holds your team, billing and one or more workspaces. Agencies typically create one workspace per client.</p>
          <div className="mt-8"><OnboardingOrgForm /></div>
        </div>
      </main>
    </div>
  );
}
