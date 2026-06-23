"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";

export type DraggableCard = {
  key: string;
  label: string;
  href: string;
  description: string;
  detail?: string;
};

function SortableCard({ card }: { card: DraggableCard }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.key });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      {...attributes}
      {...listeners}
    >
      <Link
        href={card.href}
        draggable={false}
        className="block rounded-md bg-ink-1 border border-ink-2 hover:border-ink-3 px-4 py-3 transition-colors h-full"
      >
        <div className="text-base text-ink-4">{card.label}</div>
        <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] mt-1">
          {card.description}
        </div>
        {card.detail && (
          <div className="text-[10px] text-accent font-[family-name:var(--font-mono)] mt-2">
            {card.detail}
          </div>
        )}
      </Link>
    </li>
  );
}

export function DraggableCardGrid({
  section,
  cards,
  suffix,
}: {
  section: string;
  cards: DraggableCard[];
  suffix?: ReactNode;
}) {
  const [items, setItems] = useState(cards);
  const ordersRef = useRef<Record<string, string[]>>({});

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(({ settings }) => {
        const allOrders = (settings?.card_orders ?? {}) as Record<
          string,
          string[]
        >;
        ordersRef.current = allOrders;
        const order = allOrders[section];
        if (!order?.length) return;
        const sorted = order
          .map((k) => cards.find((c) => c.key === k))
          .filter((c): c is DraggableCard => !!c);
        const remaining = cards.filter((c) => !order.includes(c.key));
        setItems([...sorted, ...remaining]);
      })
      .catch(() => {});
  }, [section, cards]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      setItems((prev) => {
        const oldIdx = prev.findIndex((c) => c.key === active.id);
        const newIdx = prev.findIndex((c) => c.key === over.id);
        const next = arrayMove(prev, oldIdx, newIdx);
        const newOrders = {
          ...ordersRef.current,
          [section]: next.map((c) => c.key),
        };
        ordersRef.current = newOrders;
        fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ card_orders: newOrders }),
        }).catch(() => {});
        return next;
      });
    },
    [section],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((c) => c.key)}
        strategy={rectSortingStrategy}
      >
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((card) => (
            <SortableCard key={card.key} card={card} />
          ))}
          {suffix}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
