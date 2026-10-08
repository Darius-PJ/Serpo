"use client";

import Link from "next/link";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { APPLICATION_STATUSES, isApplicationStatus } from "@/lib/applicationStatus";
import type { PipelineCard } from "@/lib/pipeline/types";
import { errorMessage, requestJson } from "@/lib/http/requestJson";
import { StatusSelect } from "./StatusSelect";

// Keyboard drags snap column-to-column instead of the default 25px steps:
// Space/Enter picks a card up, arrows move it between columns, Space/Enter
// drops it. Coordinates are the dragged card's viewport top-left (see
// KeyboardSensor.handleKeyDown), so landing just inside the target column
// makes collision detection resolve to it unambiguously.
const columnKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  const { collisionRect, droppableRects } = context;
  if (!collisionRect) return undefined;
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.code)) return undefined;
  event.preventDefault();

  const centerX = collisionRect.left + collisionRect.width / 2;
  const centerY = collisionRect.top + collisionRect.height / 2;
  let best: { x: number; y: number; distance: number } | null = null;

  for (const rect of droppableRects.values()) {
    const targetX = rect.left + rect.width / 2;
    const targetY = rect.top + rect.height / 2;
    const inDirection =
      event.code === "ArrowRight"
        ? targetX > centerX + 1
        : event.code === "ArrowLeft"
          ? targetX < centerX - 1
          : event.code === "ArrowDown"
            ? targetY > centerY + 1
            : targetY < centerY - 1;
    if (!inDirection) continue;
    const distance = Math.hypot(targetX - centerX, targetY - centerY);
    if (!best || distance < best.distance) {
      best = { x: rect.left + 8, y: rect.top + 8, distance };
    }
  }

  return best ?? undefined;
};

// Precise while the pointer is inside a column, rect-overlap otherwise (the
// keyboard sensor has no pointer) — the composition dnd-kit's docs recommend.
const collisionDetection: CollisionDetection = (args) => {
  const withPointer = pointerWithin(args);
  return withPointer.length > 0 ? withPointer : rectIntersection(args);
};

export function PipelineBoard({ cards }: { cards: PipelineCard[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [optimisticCards, applyOptimisticMove] = useOptimistic(
    cards,
    (state, move: { id: string; status: string }) =>
      state.map((card) => (card.id === move.id ? { ...card, status: move.status } : card)),
  );
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    // The distance constraint keeps plain clicks reaching the card's links.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnKeyboardCoordinates }),
  );

  const sources = useMemo(() => [...new Set(cards.map((card) => card.source))].sort(), [cards]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleCards = optimisticCards.filter((card) => {
    if (normalizedQuery && !`${card.company} ${card.role}`.toLowerCase().includes(normalizedQuery)) return false;
    if (source !== "all" && card.source !== source) return false;
    return true;
  });

  function moveCard(id: string, status: string) {
    startTransition(async () => {
      applyOptimisticMove({ id, status });
      setError(null);
      try {
        await requestJson(`/api/applications/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
      } catch (cause) {
        setError(errorMessage(cause, "The card could not be moved."));
      } finally {
        router.refresh();
      }
    });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    const status = String(over.id);
    const card = optimisticCards.find((candidate) => candidate.id === active.id);
    if (!card || !isApplicationStatus(status) || card.status === status) return;
    moveCard(card.id, status);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter by company or role…"
          aria-label="Filter by company or role"
          className="input-soft px-2.5 py-1.5 text-base"
        />
        <select
          value={source}
          onChange={(event) => setSource(event.target.value)}
          aria-label="Filter by source"
          className="input-soft px-2 py-1.5 text-base"
        >
          <option value="all">All sources</option>
          {sources.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
      </div>

      {error && <p role="alert" className="mb-3 text-base text-danger-dark">{error}</p>}

      <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {APPLICATION_STATUSES.map((status) => (
            <BoardColumn
              key={status}
              status={status}
              cards={visibleCards.filter((card) => card.status === status)}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}

function BoardColumn({ status, cards }: { status: string; cards: PipelineCard[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div ref={setNodeRef} className={`surface-inset p-3 ${isOver ? "ring-2 ring-primary" : ""}`}>
      <h2 className="mb-2 text-base font-bold text-heading">
        {status} ({cards.length})
      </h2>
      <ul className="space-y-2">
        {cards.map((card) => (
          <BoardCard key={card.id} card={card} />
        ))}
        {cards.length === 0 && <li className="text-sm text-foreground-muted">None</li>}
      </ul>
    </div>
  );
}

function BoardCard({ card }: { card: PipelineCard }) {
  const { setNodeRef, attributes, listeners, transform, isDragging } = useDraggable({ id: card.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`card-soft relative p-2 text-base ${
        isDragging ? "z-10 opacity-90 shadow-lg" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/applications/${card.id}`}
          className="font-semibold text-foreground hover:link-accent"
        >
          {card.company}
        </Link>
        <button
          type="button"
          {...listeners}
          {...attributes}
          aria-label={`Move ${card.company} — ${card.role}`}
          className="shrink-0 cursor-grab touch-none rounded px-1 text-foreground-muted hover:text-primary-dark"
        >
          ⠿
        </button>
      </div>
      <div className="text-foreground-muted">{card.role}</div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
        <span
          className={
            card.stageAgeStale
              ? "rounded-full bg-accent/15 px-2 py-0.5 font-semibold text-accent-light"
              : "rounded-full bg-primary/10 px-2 py-0.5 text-foreground-muted"
          }
        >
          {card.stageAgeLabel}
        </span>
        <span className="text-foreground-muted">{card.source}</span>
      </div>
      {card.nextAction && <div className="mt-1 text-sm text-foreground-muted">Next: {card.nextAction}</div>}
      {card.followUpDue && <div className="mt-1 text-sm text-accent-light">Follow-up draft due</div>}
      <div className="mt-2">
        <StatusSelect
          applicationId={card.id}
          status={card.status}
          label={`Status for ${card.company} — ${card.role}`}
        />
      </div>
    </li>
  );
}
