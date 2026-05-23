export type Habit = {
  id: string;
  name: string;
  category: string;
  target?: number;
  unit?: string;
};

export const HABITS: Habit[] = [
  { id: "move", name: "Move", category: "BODY", target: 1 },
  { id: "read", name: "Read", category: "MIND", target: 30, unit: "m" },
  { id: "hydrate", name: "Hydrate", category: "BODY", target: 2, unit: "L" },
  { id: "meditate", name: "Meditate", category: "MIND", target: 10, unit: "m" },
  { id: "write", name: "Write", category: "CRAFT", target: 1 },
  { id: "connect", name: "Connect", category: "SOCIAL", target: 1 },
];
