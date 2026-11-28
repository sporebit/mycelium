"use client";

/**
 * Dependencies on the issue page (tickets spec §3.2, §5), both directions:
 * what this ticket waits for and what it holds up. Reads and writes
 * /api/tickets/[key]/dependencies. A closed blocker is shown struck through
 * so the reader sees it no longer holds anything up.
 */
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui";
import { useApi } from "@/lib/data/useApi";
import type { Dependencies as Deps, DependencyTicket } from "@/lib/tickets/dependencies";
import { issueHref, workFetch, WorkError } from "@/lib/work/client";
import { SectionTitle } from "./kit";

function Row({ t, onRemove }: { t: DependencyTicket; onRemove: () => void }) {
	return (
		<li className="flex items-center gap-2 text-sm" data-testid="dependency-row">
			<Link href={issueHref(t.key, t.id)} className="whitespace-nowrap font-[family-name:var(--font-mono)] text-[11px] text-text-lo hover:text-glow hover:underline">
				{t.key ?? "—"}
			</Link>
			<Link href={issueHref(t.key, t.id)} className={`min-w-0 flex-1 truncate ${t.closed ? "text-text-lo line-through" : "text-text-mid hover:text-glow"}`}>
				{t.title}
			</Link>
			{t.closed && <span className="shrink-0 text-[10px] uppercase tracking-[0.1em] text-text-lo">closed</span>}
			<button type="button" onClick={onRemove} className="text-[11px] text-text-lo hover:text-v2-error" aria-label="Remove dependency">
				×
			</button>
		</li>
	);
}

export function Dependencies({ ticketKey }: { ticketKey: string }) {
	const path = `/api/tickets/${encodeURIComponent(ticketKey)}/dependencies`;
	const { data, mutate } = useApi<Deps>(path);
	const [direction, setDirection] = useState<"blocker" | "blocks">("blocker");
	const [other, setOther] = useState("");
	const [err, setErr] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function write(fn: () => Promise<unknown>) {
		setBusy(true);
		setErr(null);
		try {
			await fn();
			await mutate();
		} catch (e) {
			setErr(e instanceof WorkError ? e.message : "That did not save.");
		} finally {
			setBusy(false);
		}
	}

	const blockedBy = data?.blocked_by ?? [];
	const blocks = data?.blocks ?? [];
	const count = blockedBy.length + blocks.length;

	return (
		<section data-testid="dependencies">
			<SectionTitle count={count}>Dependencies</SectionTitle>
			<div className="grid gap-3 sm:grid-cols-2">
				<div>
					<div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-text-lo">Waits for</div>
					{blockedBy.length === 0 ? (
						<div className="text-sm text-text-lo">Nothing</div>
					) : (
						<ul className="flex flex-col gap-1" aria-label="Blocked by">
							{blockedBy.map((t) => (
								<Row key={t.id} t={t} onRemove={() => void write(() => workFetch(`${path}?blocker=${encodeURIComponent(t.key ?? t.id)}`, "DELETE"))} />
							))}
						</ul>
					)}
				</div>
				<div>
					<div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-text-lo">Holds up</div>
					{blocks.length === 0 ? (
						<div className="text-sm text-text-lo">Nothing</div>
					) : (
						<ul className="flex flex-col gap-1" aria-label="Blocks">
							{blocks.map((t) => (
								<Row key={t.id} t={t} onRemove={() => void write(() => workFetch(`${path}?blocks=${encodeURIComponent(t.key ?? t.id)}`, "DELETE"))} />
							))}
						</ul>
					)}
				</div>
			</div>
			<div className="mt-2 flex flex-wrap items-center gap-2">
				<select value={direction} onChange={(e) => setDirection(e.target.value as "blocker" | "blocks")} aria-label="Direction" className="rounded-v2-md border border-hairline-strong bg-surface-0 px-2 py-1.5 text-sm text-text-hi focus:border-glow-dim focus:outline-none">
					<option value="blocker">Waits for</option>
					<option value="blocks">Holds up</option>
				</select>
				<input
					value={other}
					onChange={(e) => setOther(e.target.value.toUpperCase())}
					placeholder="Ticket key, e.g. MYC-12"
					aria-label="Other ticket key"
					className="w-44 rounded-v2-md border border-hairline-strong bg-surface-0 px-3 py-1.5 font-[family-name:var(--font-mono)] text-sm text-text-hi placeholder:font-sans placeholder:text-text-lo focus:border-glow-dim focus:outline-none"
					onKeyDown={(e) => {
						if (e.key === "Enter" && other.trim()) {
							const k = other.trim();
							setOther("");
							void write(() => workFetch(path, "POST", { [direction]: k }));
						}
					}}
				/>
				<Button
					size="sm"
					disabled={busy || !other.trim()}
					onClick={() => {
						const k = other.trim();
						setOther("");
						void write(() => workFetch(path, "POST", { [direction]: k }));
					}}
				>
					Add
				</Button>
				{err && <span className="text-[12px] text-v2-error">{err}</span>}
			</div>
		</section>
	);
}
