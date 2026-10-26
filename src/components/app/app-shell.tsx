"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Bell, BarChart3, Building2, ChevronsUpDown, FileText, Gauge, GitCompareArrows, LayoutDashboard, LogOut, Menu, Plus, Search,
  Settings, Sparkles, Users, X, History, Check,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { Kbd } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/app/(auth)/actions";

interface Props {
  user: { name: string; email: string; isOperator: boolean; isDemo: boolean };
  workspace: { id: string; name: string; orgId: string; orgName: string; isDemo: boolean; role: string };
  workspaces: { id: string; name: string; orgId: string; orgName: string }[];
  unread: number;
  plan: { name: string; status: string; statusLabel: string; active: boolean; endsAt: string | null; isAgency: boolean };
  children: React.ReactNode;
}

export function AppShell({ user, workspace, workspaces, unread, plan, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const base = `/app/${workspace.id}`;

  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const nav = [
    { href: base, label: "Overview", icon: LayoutDashboard, exact: true },
    { href: `${base}/competitors`, label: "Competitors", icon: Building2 },
    { href: `${base}/changes`, label: "Change history", icon: History },
    { href: `${base}/insights`, label: "Insights", icon: Sparkles },
    { href: `${base}/compare`, label: "Compare", icon: GitCompareArrows },
    { href: `${base}/reports`, label: "Reports", icon: FileText },
  ];
  const secondary = [
    ...(workspaces.length > 1 || plan.isAgency ? [{ href: `${base}/agency`, label: "Agency overview", icon: Users }] : []),
    { href: `${base}/settings`, label: "Settings", icon: Settings },
    ...(user.isOperator ? [{ href: `${base}/ops`, label: "Operations", icon: Gauge }] : []),
  ];
  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

  const sidebar = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center justify-between px-4">
        <Link href={base} aria-label="RivalTide overview"><Logo light /></Link>
        <button className="rounded-md p-1 text-sidebar-muted hover:text-white lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X className="size-5" /></button>
      </div>
      <div className="px-3">
        <Dropdown>
          <DropdownTrigger className="flex w-full items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-active px-2.5 py-2 text-left hover:border-sidebar-muted focus-visible:outline-2 focus-visible:outline-primary" aria-label="Switch workspace">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/15 text-[11px] font-semibold text-primary">{workspace.name.slice(0, 2).toUpperCase()}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-white">{workspace.name}</span>
              <span className="block truncate text-[11px] text-sidebar-muted">{workspace.orgName}</span>
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-sidebar-muted" />
          </DropdownTrigger>
          <DropdownContent align="start" className="w-64">
            <DropdownLabel>Workspaces</DropdownLabel>
            {workspaces.map((w) => (
              <DropdownItem key={w.id} onSelect={() => router.push(`/app/${w.id}`)}>
                <span className="min-w-0 flex-1"><span className="block truncate">{w.name}</span><span className="block truncate text-xs text-muted">{w.orgName}</span></span>
                {w.id === workspace.id ? <Check className="!text-primary" /> : null}
              </DropdownItem>
            ))}
            {!workspace.isDemo ? (
              <>
                <DropdownSeparator />
                <DropdownItem onSelect={() => router.push(`${base}/settings/workspaces`)}><Plus /> New client workspace</DropdownItem>
              </>
            ) : null}
          </DropdownContent>
        </Dropdown>
      </div>
      <nav className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-3" aria-label="Workspace">
        {nav.map((n) => (
          <Link key={n.href} href={n.href} aria-current={isActive(n.href, n.exact) ? "page" : undefined}
            className={cn("flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13.5px] transition-colors hover:bg-sidebar-active hover:text-white", isActive(n.href, n.exact) && "bg-sidebar-active text-white")}>
            <n.icon className={cn("size-4", isActive(n.href, n.exact) ? "text-primary" : "text-sidebar-muted")} aria-hidden />{n.label}
          </Link>
        ))}
        <div className="my-3 h-px bg-sidebar-border" />
        {secondary.map((n) => (
          <Link key={n.href} href={n.href} aria-current={isActive(n.href) ? "page" : undefined}
            className={cn("flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13.5px] transition-colors hover:bg-sidebar-active hover:text-white", isActive(n.href) && "bg-sidebar-active text-white")}>
            <n.icon className={cn("size-4", isActive(n.href) ? "text-primary" : "text-sidebar-muted")} aria-hidden />{n.label}
          </Link>
        ))}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <Link href={`${base}/settings/billing`} className="mb-2 block rounded-md px-2.5 py-2 text-[12px] hover:bg-sidebar-active">
          <span className="flex items-center justify-between"><span className="font-medium text-white">{plan.name}</span><BarChart3 className="size-3.5 text-sidebar-muted" /></span>
          <span className={cn("text-sidebar-muted", !plan.active && "text-warning")}>{plan.statusLabel}{plan.endsAt && (plan.status === "trialing" || plan.status === "pilot") ? ` · ends ${new Date(plan.endsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}</span>
        </Link>
        <Dropdown>
          <DropdownTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-sidebar-active" aria-label="Account menu">
            <span className="flex size-7 items-center justify-center rounded-full bg-sidebar-border text-[11px] font-semibold text-white">{(user.name || user.email).slice(0, 1).toUpperCase()}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-[12.5px] text-white">{user.name}</span><span className="block truncate text-[11px] text-sidebar-muted">{user.isDemo ? "Demo visitor" : user.email}</span></span>
          </DropdownTrigger>
          <DropdownContent align="start" side="top" className="w-56">
            <DropdownItem onSelect={() => router.push(`${base}/settings/account`)}><Settings /> Account settings</DropdownItem>
            <DropdownSeparator />
            <DropdownItem onSelect={() => void logoutAction()}><LogOut /> {user.isDemo ? "Leave demo" : "Sign out"}</DropdownItem>
          </DropdownContent>
        </Dropdown>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:pl-60">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 lg:block">{sidebar}</aside>
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-72 fade-in">{sidebar}</aside>
        </div>
      ) : null}
      {workspace.isDemo ? (
        <div className="sticky top-0 z-30 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-warning px-4 py-1.5 text-center text-[12.5px] font-medium text-black">
          <span>Demo workspace — all companies, prices and changes are fictional. Nothing here is live competitor data.</span>
          <Link href="/signup" className="underline underline-offset-2">Create a real account</Link>
        </div>
      ) : null}
      <header className={cn("sticky z-20 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur sm:px-6", workspace.isDemo ? "top-[30px]" : "top-0")}>
        <button className="rounded-md p-1.5 text-muted hover:bg-surface-2 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu className="size-5" /></button>
        <form action={`${base}/search`} role="search" className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
          <label htmlFor="global-search" className="sr-only">Search competitors, pages, changes, insights and reports</label>
          <input ref={searchRef} id="global-search" name="q" type="search" placeholder="Search competitors, changes, reports…" autoComplete="off"
            className="h-9 w-full rounded-lg border border-border bg-surface pl-8 pr-12 text-[13px] placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
          <span className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 sm:block"><Kbd>⌘K</Kbd></span>
        </form>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle className="hidden sm:inline-flex" />
          <Link href={`${base}/notifications`} className="relative rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-foreground" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
            <Bell className="size-[18px]" />
            {unread > 0 ? <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">{unread > 99 ? "99+" : unread}</span> : null}
          </Link>
        </div>
      </header>
      {!plan.active ? (
        <div className="border-b border-warning/30 bg-warning-soft px-6 py-2 text-[13px] text-warning-soft-foreground">
          Your plan is {plan.statusLabel.toLowerCase()}. Monitoring is paused and new content cannot be added. <Link href={`${base}/settings/billing`} className="font-medium underline">Choose a plan</Link>
        </div>
      ) : null}
      <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
