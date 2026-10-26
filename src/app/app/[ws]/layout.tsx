import { withUser } from "@/server/db";
import { loadWorkspace } from "@/server/workspace";
import { listMemberships } from "@/server/services/accounts";
import { unreadAlertCount } from "@/server/services/organization";
import { getEntitlements } from "@/server/billing/entitlements";
import { AppShell } from "@/components/app/app-shell";

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const { user, ctx } = await loadWorkspace(ws);
  const [{ memberships, workspaces }, unread, ent] = await Promise.all([
    listMemberships(user.id),
    withUser(user.id, (tx) => unreadAlertCount(tx, user.id)),
    withUser(user.id, (tx) => getEntitlements(tx, ctx.orgId)),
  ]);
  return (
    <AppShell
      user={{ name: user.name, email: user.email, isOperator: user.isOperator, isDemo: user.isDemo }}
      workspace={{ id: ctx.workspaceId, name: ctx.workspaceName, orgId: ctx.orgId, orgName: ctx.orgName, isDemo: ctx.isDemo, role: ctx.role }}
      workspaces={workspaces.map((w) => ({ id: w.id, name: w.name, orgId: w.organizationId, orgName: memberships.find((m) => m.organizationId === w.organizationId)?.organizationName ?? "" }))}
      unread={unread}
      plan={{ name: ent.planName, status: ent.status, statusLabel: ent.statusLabel, active: ent.active, endsAt: ent.endsAt?.toISOString() ?? null, isAgency: ent.limits.workspaces > 2 }}
    >
      {children}
    </AppShell>
  );
}
