import { redirect } from "next/navigation";
import { inWorkspace, loadWorkspace } from "@/server/workspace";
import { getEntitlements, getUsage } from "@/server/billing/entitlements";
import { PageHeader } from "@/components/ui/misc";
import { AddCompetitorWizard } from "@/components/app/add-competitor-wizard";
import { OnboardingSteps } from "@/components/app/onboarding-steps";

export const metadata = { title: "Add competitor" };

export default async function NewCompetitorPage({ params, searchParams }: { params: Promise<{ ws: string }>; searchParams: Promise<{ onboarding?: string }> }) {
  const { ws } = await params;
  const { onboarding } = await searchParams;
  const { ctx } = await loadWorkspace(ws);
  if (ctx.isDemo) redirect(`/app/${ws}/competitors`);
  const { ent, usage } = await inWorkspace(ws, async (tx, c) => ({ ent: await getEntitlements(tx, c.orgId), usage: await getUsage(tx, c.orgId) }));
  const wizard = (
    <AddCompetitorWizard ws={ws} onboarding={onboarding === "1"} remainingPages={Math.max(0, ent.limits.pages - usage.pages)}
      remainingCompetitors={Math.max(0, ent.limits.competitors - usage.competitors)} active={ent.active} />
  );
  if (onboarding === "1") {
    return (
      <div className="grid gap-10 lg:grid-cols-[240px_1fr]">
        <OnboardingSteps current={3} />
        <div className="max-w-2xl">
          <PageHeader title="Add your first competitor" description="Enter their website. We'll check it's publicly accessible and suggest pages worth monitoring." />
          {wizard}
        </div>
      </div>
    );
  }
  return (
    <div className="max-w-2xl">
      <PageHeader title="Add competitor" description="Enter their website. We'll check it's publicly accessible and suggest pages worth monitoring." />
      {wizard}
    </div>
  );
}
