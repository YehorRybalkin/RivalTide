import Link from "next/link";
import { AcceptInviteForm } from "@/components/auth-forms";
import { getSessionUser } from "@/server/auth/session";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Accept invitation" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getSessionUser();
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">You&apos;ve been invited</h1>
      <p className="mb-6 mt-1 text-[13.5px] text-muted">Join your team&apos;s RivalTide organization.</p>
      {user && !user.isDemo ? (
        <>
          <p className="mb-4 text-[13px] text-muted">Signed in as <span className="font-medium text-foreground">{user.email}</span>.</p>
          <AcceptInviteForm token={token} />
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <Button asChild><Link href={`/signup?next=/invite/${encodeURIComponent(token)}`}>Create an account</Link></Button>
          <Button asChild variant="secondary"><Link href={`/login?next=/invite/${encodeURIComponent(token)}`}>I already have an account</Link></Button>
        </div>
      )}
    </>
  );
}
