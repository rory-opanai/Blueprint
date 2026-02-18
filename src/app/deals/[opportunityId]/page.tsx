import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { DealWorkspaceClient } from "@/components/deal-workspace-client";
import { getDealData } from "@/lib/data/store";
import { requireUserSession } from "@/lib/auth/guards";

export default async function DealPage({
  params,
  searchParams
}: {
  params: Promise<{ opportunityId: string }>;
  searchParams: Promise<{ ownerEmail?: string }>;
}) {
  const { opportunityId } = await params;
  const { ownerEmail: ownerEmailParam } = await searchParams;
  const viewer = await requireUserSession();
  const ownerEmail = ownerEmailParam ?? viewer.email ?? undefined;
  const detail = await getDealData(opportunityId, {
    ownerEmail,
    withSignals: true,
    viewerUserId: viewer.id,
    viewerEmail: viewer.email,
    viewerRole: viewer.role
  });

  if (!detail) {
    notFound();
  }

  return (
    <AppShell>
      <DealWorkspaceClient detail={detail} />
    </AppShell>
  );
}
