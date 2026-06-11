"use client";

import { useSearchParams } from "next/navigation";
import { useParams } from "next/navigation";
import { Suspense } from "react";
import { AgentChat } from "@/components/agents/AgentChat";

function AgentChatWithQuery({ agentId }: { agentId: string }) {
  const searchParams = useSearchParams();
  const q = searchParams.get("q");
  return <AgentChat agentId={agentId} initialQuery={q} />;
}

export default function AgentChatPage() {
  const params = useParams();
  const agentId = params.agentId as string;
  return (
    <Suspense fallback={null}>
      <AgentChatWithQuery agentId={agentId} />
    </Suspense>
  );
}
