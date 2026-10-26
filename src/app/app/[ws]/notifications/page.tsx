import Link from "next/link";
import { Bell, Mail, Settings } from "lucide-react";
import { loadWorkspace } from "@/server/workspace";
import { withUser } from "@/server/db";
import { listAlerts } from "@/server/services/organization";
import { isEmailConfigured } from "@/server/env";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { markAlertsReadAction } from "../actions";
import { cn, timeAgo } from "@/lib/utils";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage({ params, searchParams }: { params: Promise<{ ws: string }>; searchParams: Promise<{ unread?: string }> }) {
  const { ws } = await params;
  const { unread } = await searchParams;
  const { user } = await loadWorkspace(ws);
  const alerts = await withUser(user.id, (tx) => listAlerts(tx, user.id, { unreadOnly: unread === "1", limit: 100 }));
  const unreadCount = alerts.filter((a) => !a.readAt).length;
  return (
    <div className="max-w-3xl">
      <PageHeader title="Notifications" description="Alerts for validated, material changes across all your workspaces."
        actions={<>
          <Button asChild variant="ghost" size="sm"><Link href={`/app/${ws}/settings/notifications`}><Settings /> Preferences</Link></Button>
          {unreadCount ? <form action={markAlertsReadAction}><input type="hidden" name="ws" value={ws} /><Button type="submit" variant="secondary" size="sm">Mark all as read</Button></form> : null}
        </>} />
      {!isEmailConfigured() ? <Notice tone="info" className="mb-4">Email delivery is not configured on this server. Alerts appear here in-app; no emails are being sent.</Notice> : null}
      <div className="mb-3 flex gap-2 text-[13px]">
        <Link href="?" className={cn("rounded-md px-2.5 py-1", unread !== "1" ? "bg-surface-2 font-medium" : "text-muted")}>All</Link>
        <Link href="?unread=1" className={cn("rounded-md px-2.5 py-1", unread === "1" ? "bg-surface-2 font-medium" : "text-muted")}>Unread</Link>
      </div>
      {alerts.length === 0 ? <EmptyState icon={Bell} title="You're all caught up" description="Alerts are created only for verified changes of medium or high severity that match your preferences." /> : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {alerts.map((a) => (
              <li key={a.id} className={cn("relative flex gap-3 px-5 py-4", !a.readAt && "bg-accent-soft/30")}>
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", a.readAt ? "bg-transparent" : "bg-accent")} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13.5px] font-semibold">{a.title}</span>
                    <Badge tone={a.severity === "high" ? "red" : "amber"} className="capitalize">{a.severity}</Badge>
                    {a.emailedAt ? <Badge tone="outline"><Mail className="size-3" /> Emailed</Badge> : null}
                  </div>
                  <p className="mt-0.5 text-[13px] text-muted">{a.body}</p>
                  <p className="mt-1 text-[12px] text-subtle">{a.workspaceName} · {timeAgo(a.createdAt)}</p>
                </div>
                {a.changeId ? <Link href={`/app/${a.workspaceId}/changes/${a.changeId}`} className="self-center text-[13px] text-accent hover:underline after:absolute after:inset-0">View</Link> : null}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
