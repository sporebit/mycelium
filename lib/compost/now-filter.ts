import type { Task } from "@/lib/types/task";
import type { CurrentContext } from "@/lib/types/context";

type DeviceKind = "pc" | "phone" | "tablet";

/**
 * "Right now" relevance scoring for a task against the user's current
 * context.
 *
 *   score      = count of context fields the task matches (0..4)
 *   contradicts = true if any task field is set AND disagrees with the
 *                 current context (and isn't a wildcard like
 *                 context_where='anywhere')
 *
 * The caller hides contradicting tasks entirely and sorts the rest by
 * score desc.
 */
export function scoreTaskForContext(
  task: Task,
  current: CurrentContext,
  detectedDevice: DeviceKind,
): { score: number; contradicts: boolean } {
  if (task.completed_at) return { score: 0, contradicts: true };
  if (task.status === "completed" || task.status === "cancelled") {
    return { score: 0, contradicts: true };
  }

  let score = 0;
  let contradicts = false;
  const activeDevice = current.device ?? detectedDevice;

  // Device: contradict only if task specifies a different device.
  if (task.context_device) {
    if (task.context_device === activeDevice) score += 1;
    else contradicts = true;
  }

  // Where: 'anywhere' matches any. Specific value only matches when
  // current is the same OR current is null (treat as "anywhere").
  if (task.context_where) {
    if (task.context_where === "anywhere") {
      score += 1;
    } else if (!current.where || current.where === task.context_where) {
      score += 1;
    } else {
      contradicts = true;
    }
  }

  // Energy: nullable on both sides — match if equal or task has no
  // requirement.
  if (task.context_energy) {
    if (!current.energy || current.energy === task.context_energy) score += 1;
    else contradicts = true;
  }

  // Context tag: matches when current has the same tag, OR current
  // has no tag set (don't contradict on a tag the user hasn't picked).
  if (task.context_tag) {
    if (!current.context_tag) score += 0; // not a match, but not a contradiction
    else if (current.context_tag === task.context_tag) score += 1;
    else contradicts = true;
  }

  return { score, contradicts };
}
