"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";

type TransitionState = {
  active: boolean;
  colour: string;
  originX: number;
  originY: number;
  direction: "enter" | "exit";
};

type TransitionAPI = {
  state: TransitionState;
  bloom: (opts: {
    colour: string;
    originX: number;
    originY: number;
    direction: "enter" | "exit";
  }) => Promise<void>;
  clear: () => void;
};

const INITIAL: TransitionState = {
  active: false,
  colour: "#84f5b8",
  originX: 0,
  originY: 0,
  direction: "enter",
};

const Ctx = createContext<TransitionAPI>({
  state: INITIAL,
  bloom: async () => {},
  clear: () => {},
});

export function useTransition() {
  return useContext(Ctx);
}

const BLOOM_MS = 480;

export function TransitionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TransitionState>(INITIAL);
  const resolveRef = useRef<(() => void) | null>(null);

  const bloom = useCallback(
    (opts: {
      colour: string;
      originX: number;
      originY: number;
      direction: "enter" | "exit";
    }) =>
      new Promise<void>((resolve) => {
        resolveRef.current = resolve;
        setState({
          active: true,
          colour: opts.colour,
          originX: opts.originX,
          originY: opts.originY,
          direction: opts.direction,
        });
        setTimeout(() => {
          resolveRef.current?.();
          resolveRef.current = null;
        }, BLOOM_MS);
      }),
    [],
  );

  const clear = useCallback(() => {
    setState(INITIAL);
  }, []);

  return <Ctx value={{ state, bloom, clear }}>{children}</Ctx>;
}
