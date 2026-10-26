import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export function LegalPage({ title, updated, children, draft = true }: { title: string; updated: string; children: React.ReactNode; draft?: boolean }) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border"><div className="mx-auto flex h-14 max-w-3xl items-center px-4 sm:px-6"><Link href="/"><Logo /></Link></div></header>
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        {draft ? (
          <div className="mb-8 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-[13px] text-warning-soft-foreground" role="note">
            <strong>Template — requires legal review.</strong> This document is a starting template and has not been reviewed by a lawyer. It does not certify compliance with any law or standard. Replace bracketed placeholders before launch.
          </div>
        ) : null}
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted">Last updated: {updated}</p>
        <div className="mt-8 space-y-6 text-[14.5px] leading-relaxed [&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:text-foreground/90 [&_ul]:space-y-1.5">{children}</div>
      </main>
    </div>
  );
}
