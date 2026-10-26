import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth-forms";
import { getSessionUser } from "@/server/auth/session";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  const sp = await searchParams;
  const user = await getSessionUser();
  if (user && !user.isDemo) redirect("/app");
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mb-6 mt-1 text-[13.5px] text-muted">Sign in to your RivalTide workspace.</p>
      <LoginForm next={sp.next} notice={sp.reset ? "Your password was updated. Sign in with your new password." : undefined} />
      <p className="mt-6 text-center text-[13px] text-muted">New to RivalTide? <Link href="/signup" className="font-medium text-accent hover:underline">Create an account</Link></p>
    </>
  );
}
