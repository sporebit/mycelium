"use client";

import { createContext, useContext } from "react";
import type { Task } from "@/lib/types/task";

export type RowGestureActions = {
  /** Swipe right on touch — mark done. */
  onSwipeComplete?: (t: Task) => void;
  /** Swipe left on touch — open the reschedule sheet. */
  onSwipeReschedule?: (t: Task) => void;
  /** Long press on touch — enter bulk-select. */
  onLongPress?: (t: Task) => void;
};

/**
 * Row gestures are identical in every view and depend only on the task, so
 * they travel by context rather than being threaded as props through
 * TaskMainView → TaskListView → TaskRowList and → TaskSmart/TaskCategory →
 * TaskCard. Views that render rows opt in simply by being inside the
 * provider; desktop is unaffected because the gestures only fire for
 * pointerType "touch".
 */
const RowGestureContext = createContext<RowGestureActions>({});

export const RowGestureProvider = RowGestureContext.Provider;

export function useRowGestureActions(): RowGestureActions {
  return useContext(RowGestureContext);
}
