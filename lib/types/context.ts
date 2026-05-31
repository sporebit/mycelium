export type ContextEnergy = "low" | "medium" | "high";

export const CONTEXT_ENERGIES: readonly ContextEnergy[] = [
  "low",
  "medium",
  "high",
];

export type ContextField = "where" | "device" | "context_tag";

export const CONTEXT_FIELDS: readonly ContextField[] = [
  "where",
  "device",
  "context_tag",
];

export type ContextOption = {
  id: string;
  user_id: string;
  field: ContextField;
  value: string;
  label: string;
  icon: string | null;
  use_count: number;
  created_at: string;
};

/** What the ContextSwitcher widget stores in localStorage. */
export type CurrentContext = {
  where: string | null;
  device: string | null;
  energy: ContextEnergy | null;
  context_tag: string | null;
};

export const EMPTY_CONTEXT: CurrentContext = {
  where: null,
  device: null,
  energy: null,
  context_tag: null,
};
