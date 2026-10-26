import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,560px)]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link href="/" className="w-fit"><Logo /></Link>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm fade-in">{children}</div>
        </div>
        <p className="text-xs text-muted">© {new Date().getFullYear()} RivalTide · <Link href="/legal/privacy" className="hover:text-foreground">Privacy</Link> · <Link href="/legal/terms" className="hover:text-foreground">Terms</Link></p>
      </div>
      <aside className="relative hidden overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex lg:flex-col lg:justify-center">
        <div className="absolute inset-0 opacity-[0.07] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:22px_22px]" aria-hidden />
        <div className="relative">
          <p className="text-sm font-medium text-primary">Stay ahead of the competition.</p>
          <h2 className="mt-3 text-2xl font-semibold leading-snug text-white">Track competitors. Understand every move. Make smarter decisions.</h2>
          <ul className="mt-8 space-y-4 text-[14px]">
            {[
              "Scheduled monitoring of the competitor pages you choose",
              "Every change backed by before/after evidence",
              "Pricing changes parsed with plan and billing period",
              "Insights that separate observed facts from interpretation",
            ].map((t) => (
              <li key={t} className="flex gap-3"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />{t}</li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
