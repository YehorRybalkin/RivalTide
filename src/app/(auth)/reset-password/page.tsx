import Link from "next/link";
import { ResetForm } from "@/components/auth-forms";
import { Notice } from "@/components/ui/misc";

export const metadata = { title: "Choose a new password" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mb-6 mt-1 text-[13.5px] text-muted">All existing sessions will be signed out.</p>
      {token ? <ResetForm token={token} /> : <Notice tone="danger">This reset link is missing its token. <Link href="/forgot-password" className="underline">Request a new one</Link>.</Notice>}
    </>
  );
}
