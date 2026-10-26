import { NextResponse } from "next/server";
import { systemDb } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await systemDb()`select 1`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
