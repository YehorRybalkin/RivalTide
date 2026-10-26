"use server";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { createOrganization } from "@/server/services/accounts";
import { safeAction, type ActionState } from "@/server/actions";
import { rateLimit } from "@/server/rate-limit";

export async function createOrgAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (user.isDemo) return { error: "Create a real account to set up an organization." };
  if (!(await rateLimit(`org:create:${user.id}`, 5, 3600))) return { error: "Too many organizations created. Try again later." };
  let wsId = "";
  const res = await safeAction(async () => {
    const r = await createOrganization(user.id, {
      orgName: String(form.get("orgName") ?? ""),
      workspaceName: String(form.get("workspaceName") ?? ""),
      clientName: String(form.get("clientName") ?? "") || null,
    });
    wsId = r.workspaceId;
  });
  if (res.error) return res;
  redirect(`/app/${wsId}/competitors/new?onboarding=1`);
}
