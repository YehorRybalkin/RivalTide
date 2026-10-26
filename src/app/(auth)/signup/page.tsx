import Link from "next/link";
import { SignupForm } from "@/components/auth-forms";

export const metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Start monitoring</h1>
      <p className="mb-6 mt-1 text-[13.5px] text-muted">Create your account. Your trial starts once you set up a workspace — no card required.</p>
      <SignupForm next={sp.next} />
      <p className="mt-6 text-center text-[13px] text-muted">Already have an account? <Link href="/login" className="font-medium text-accent hover:underline">Sign in</Link></p>
    </>
  );
}
