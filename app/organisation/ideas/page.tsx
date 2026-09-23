import { DecisionsClient } from "@/components/compost/DecisionsClient";

/**
 * Ideas (MYC-156): captures of kind "idea", kept as captures — the seed
 * dumps the Ideas spec (claude/ideas-spec.md) will pick up when it ships.
 */
export default function IdeasPage() {
  return <DecisionsClient kind="idea" label="Idea" plural="ideas" badgeClass="bg-glow-2/15 text-glow-2 border-glow-2/40" />;
}
