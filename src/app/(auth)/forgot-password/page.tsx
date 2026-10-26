import Link from "next/link";
import { ForgotForm } from "@/components/auth-forms";
import { isEmailConfigured } from "@/server/env";

export const metadata = { title: "Reset password" };
export const dynamic = "force-dynamic";

export default function ForgotPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mb-6 mt-1 text-[13.5px] text-muted">Enter your email and we&apos;ll send a reset link.</p>
      <ForgotForm emailConfigured={isEmailConfigured()} />
      <p className="mt-6 text-center text-[13px] text-muted"><Link href="/login" className="text-accent hover:underline">Back to sign in</Link></p>
    </>
  );
}
