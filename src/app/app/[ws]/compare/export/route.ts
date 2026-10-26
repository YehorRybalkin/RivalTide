import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { withUser } from "@/server/db";
import { resolveWorkspace } from "@/server/services/context";
import { buildComparison, comparisonToCsv } from "@/server/services/compare";
import { AppError } from "@/server/services/errors";

export async function GET(req: NextRequest, { params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const csv = await withUser(user.id, async (tx) => {
      const ctx = await resolveWorkspace(tx, user.id, ws);
      return comparisonToCsv(await buildComparison(tx, ctx, req.nextUrl.searchParams.getAll("c")));
    });
    return new NextResponse(`﻿${csv}`, {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="rivaltide-comparison-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store" },
    });
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ error: e.message }, { status: e.code === "not_found" ? 404 : 400 });
    throw e;
  }
}
