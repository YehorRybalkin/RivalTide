import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { listMemberships } from "@/server/services/accounts";

export default async function AppIndex() {
  const user = await requireUser();
  const { workspaces } = await listMemberships(user.id);
  if (workspaces.length === 0) redirect("/onboarding");
  redirect(`/app/${workspaces[0]!.id}`);
}
