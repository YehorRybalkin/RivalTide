import { SettingsNav } from "@/components/app/settings-nav";
import { PageHeader } from "@/components/ui/misc";

export default async function SettingsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
        <SettingsNav ws={ws} />
        <div className="min-w-0 max-w-3xl space-y-6">{children}</div>
      </div>
    </>
  );
}
