"use client";

/**
 * Work — the small parts every Work page is made of. Presentational only:
 * nothing here fetches. Colours come from the Loam & Glow v2 tokens; a
 * status's tone comes from its category, never from its name.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import {
	Bookmark,
	BookOpen,
	Bug,
	Circle,
	ClipboardCheck,
	CornerDownRight,
	FlaskConical,
	ListChecks,
	SquareCheck,
	Wrench,
	Zap,
	type LucideIcon,
} from "lucide-react";
import { fmtDay, isOverdue, issueHref } from "@/lib/work/client";
import { STATUS_CATEGORY_LABEL, type StatusCategory } from "@/lib/work/query";
import type { WorkLabel, WorkPerson, WorkTicket } from "@/lib/work/types";

const TYPE_ICONS: Record<string, LucideIcon> = {
	zap: Zap,
	bookmark: Bookmark,
	"check-square": SquareCheck,
	bug: Bug,
	"corner-down-right": CornerDownRight,
	"list-checks": ListChecks,
	"flask-conical": FlaskConical,
	"book-open": BookOpen,
	wrench: Wrench,
	"clipboard-check": ClipboardCheck,
};

export function TypeIcon({ type, size = 14 }: { type: { name: string; icon: string | null; colour: string | null } | null; size?: number }) {
	const Icon = (type?.icon && TYPE_ICONS[type.icon]) || Circle;
	return (
		<span className="inline-flex shrink-0 items-center" title={type?.name ?? "No type"} style={{ color: type?.colour ?? "var(--text-lo)" }}>
			<Icon size={size} aria-hidden />
			<span className="sr-only">{type?.name ?? "No type"}</span>
		</span>
	);
}

export const CATEGORY_TONE: Record<StatusCategory, string> = {
	todo: "border-hairline-strong bg-surface-2 text-text-mid",
	in_progress: "border-v2-info/40 bg-v2-info/10 text-v2-info",
	done: "border-glow-dim/40 bg-glow-wash text-glow",
};

export function StatusPill({ status, className = "" }: { status: { name: string; category: StatusCategory } | null; className?: string }) {
	if (!status) return <span className={`text-[11px] text-text-lo ${className}`}>No status</span>;
	return (
		<span
			className={`inline-flex max-w-[14rem] items-center truncate rounded-v2-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] ${CATEGORY_TONE[status.category]} ${className}`}
			title={`${status.name} · ${STATUS_CATEGORY_LABEL[status.category]}`}
		>
			{status.name}
		</span>
	);
}

export function LabelChip({ label, onRemove }: { label: Pick<WorkLabel, "name" | "colour" | "field">; onRemove?: () => void }) {
	return (
		<span
			className="inline-flex items-center gap-1 rounded-full border border-hairline-strong bg-surface-2 px-2 py-0.5 text-[11px] text-text-mid"
			title={label.field === "labels" ? label.name : `${label.field}: ${label.name}`}
		>
			{label.colour && <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: label.colour }} />}
			{label.field !== "labels" && <span className="text-text-lo">{label.field}</span>}
			{label.name}
			{onRemove && (
				<button type="button" onClick={onRemove} aria-label={`Remove ${label.name}`} className="-mr-0.5 text-text-lo hover:text-text-hi">
					×
				</button>
			)}
		</span>
	);
}

function initials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "?";
	return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ person, size = 20 }: { person: WorkPerson | null; size?: number }) {
	if (!person) {
		return (
			<span
				className="inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-hairline-strong text-text-lo"
				style={{ width: size, height: size, fontSize: size * 0.45 }}
				title="Unassigned"
			>
				–
			</span>
		);
	}
	return (
		<span
			className="inline-flex shrink-0 items-center justify-center rounded-full bg-surface-3 font-medium text-text-hi"
			style={{ width: size, height: size, fontSize: size * 0.42 }}
			title={person.name}
		>
			{initials(person.name)}
		</span>
	);
}

export function Points({ value }: { value: number | null }) {
	if (value == null) return null;
	return (
		<span className="inline-flex min-w-[1.4rem] justify-center rounded-full bg-surface-3 px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[10px] text-text-mid" title={`${value} points`}>
			{value}
		</span>
	);
}

export function DueChip({ ticket }: { ticket: Pick<WorkTicket, "due" | "status"> }) {
	if (!ticket.due) return null;
	const late = isOverdue(ticket);
	return (
		<span className={`whitespace-nowrap text-[11px] ${late ? "font-medium text-v2-error" : "text-text-lo"}`} title={late ? `Overdue — was due ${ticket.due}` : `Due ${ticket.due}`}>
			{late ? "Overdue · " : ""}
			{fmtDay(ticket.due)}
		</span>
	);
}

export function KeyLink({ ticket, className = "" }: { ticket: { id: string; key: string | null }; className?: string }) {
	return (
		<Link
			href={issueHref(ticket.key, ticket.id)}
			className={`whitespace-nowrap font-[family-name:var(--font-mono)] text-[11px] text-text-lo hover:text-glow hover:underline ${className}`}
		>
			{ticket.key ?? "—"}
		</Link>
	);
}

/** One issue in a list: type, key, title, labels, points, due, status, assignee. */
export function IssueRow({
	ticket,
	showProject = false,
	showStatus = true,
	leading,
	trailing,
	dense = false,
}: {
	ticket: WorkTicket;
	showProject?: boolean;
	showStatus?: boolean;
	leading?: ReactNode;
	trailing?: ReactNode;
	dense?: boolean;
}) {
	const resolved = ticket.status?.category === "done";
	return (
		<div className={`group flex items-center gap-2 rounded-v2-md border border-hairline bg-surface-1 px-3 ${dense ? "py-1.5" : "py-2"} hover:border-hairline-strong hover:bg-surface-2`}>
			{leading}
			<TypeIcon type={ticket.type} />
			<KeyLink ticket={ticket} />
			<Link href={issueHref(ticket.key, ticket.id)} className={`min-w-0 flex-1 truncate text-sm ${resolved ? "text-text-lo line-through decoration-text-lo/50" : "text-text-hi"} hover:underline`}>
				{ticket.title}
			</Link>
			{ticket.epic && (
				<Link
					href={issueHref(ticket.epic.key, ticket.epic.id)}
					className="hidden max-w-[10rem] truncate rounded-v2-sm border border-hairline-strong px-1.5 py-0.5 text-[10px] text-text-mid hover:text-text-hi md:inline"
					title={`Epic: ${ticket.epic.title}`}
				>
					{ticket.epic.title}
				</Link>
			)}
			<span className="hidden items-center gap-1 lg:flex">
				{ticket.labels.slice(0, 3).map((l) => (
					<LabelChip key={l.id} label={l} />
				))}
				{ticket.labels.length > 3 && <span className="text-[11px] text-text-lo">+{ticket.labels.length - 3}</span>}
			</span>
			{showProject && ticket.project && <span className="hidden whitespace-nowrap text-[11px] text-text-lo sm:inline">{ticket.project.name}</span>}
			<DueChip ticket={ticket} />
			<Points value={ticket.points} />
			{showStatus && <StatusPill status={ticket.status} className="hidden sm:inline-flex" />}
			<Avatar person={ticket.assignee} />
			{trailing}
		</div>
	);
}

export function PageHeader({
	title,
	crumbs = [],
	actions,
	sub,
}: {
	title: ReactNode;
	crumbs?: Array<{ label: string; href?: string }>;
	actions?: ReactNode;
	sub?: ReactNode;
}) {
	return (
		<header className="mb-4">
			{crumbs.length > 0 && (
				<nav aria-label="Breadcrumb" className="mb-1 flex flex-wrap items-center gap-1 text-[11px] text-text-lo">
					{crumbs.map((c, i) => (
						<span key={`${c.label}-${i}`} className="inline-flex items-center gap-1">
							{i > 0 && <span aria-hidden>/</span>}
							{c.href ? (
								<Link href={c.href} className="hover:text-text-hi hover:underline">
									{c.label}
								</Link>
							) : (
								<span>{c.label}</span>
							)}
						</span>
					))}
				</nav>
			)}
			<div className="flex flex-wrap items-start justify-between gap-3">
				<h1 className="min-w-0 text-lg font-semibold text-text-hi">{title}</h1>
				{actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
			</div>
			{sub && <div className="mt-1 text-sm text-text-mid">{sub}</div>}
		</header>
	);
}

export function TabLinks({ tabs, active }: { tabs: Array<{ label: string; href: string; key: string }>; active: string }) {
	return (
		<nav className="mb-4 flex gap-1 overflow-x-auto border-b border-hairline" aria-label="Sections">
			{tabs.map((t) => (
				<Link
					key={t.key}
					href={t.href}
					aria-current={t.key === active ? "page" : undefined}
					className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${
						t.key === active ? "border-glow text-text-hi" : "border-transparent text-text-mid hover:text-text-hi"
					}`}
				>
					{t.label}
				</Link>
			))}
		</nav>
	);
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
	return (
		<div className="rounded-v2-lg border border-dashed border-hairline-strong bg-surface-1 px-6 py-10 text-center">
			<p className="text-sm font-medium text-text-hi">{title}</p>
			{children && <div className="mx-auto mt-1 max-w-md text-sm text-text-mid">{children}</div>}
			{action && <div className="mt-4 flex justify-center">{action}</div>}
		</div>
	);
}

export function ErrorNote({ children }: { children: ReactNode }) {
	if (!children) return null;
	return (
		<p role="alert" className="rounded-v2-md border border-v2-error/40 bg-v2-error/10 px-3 py-2 text-sm text-v2-error">
			{children}
		</p>
	);
}

export function SectionTitle({ children, count, action }: { children: ReactNode; count?: number | null; action?: ReactNode }) {
	return (
		<div className="mb-2 flex items-center justify-between gap-2">
			<h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-mid">
				{children}
				{count != null && <span className="ml-2 font-normal text-text-lo">{count}</span>}
			</h2>
			{action}
		</div>
	);
}

export const INPUT =
	"w-full rounded-v2-md border border-hairline-strong bg-surface-0 px-3 py-2 text-sm text-text-hi placeholder:text-text-lo focus:border-glow-dim focus:outline-none focus:ring-1 focus:ring-glow-dim";

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
	return (
		<div className="flex flex-col gap-1">
			<label htmlFor={htmlFor} className="text-[11px] font-medium uppercase tracking-[0.1em] text-text-lo">
				{label}
			</label>
			{children}
			{hint && <p className="text-[11px] text-text-lo">{hint}</p>}
		</div>
	);
}

/** Progress by status category: To Do · In Progress · Done. */
export function ProgressBar({ todo, inProgress, done }: { todo: number; inProgress: number; done: number }) {
	const total = todo + inProgress + done;
	if (total === 0) return <div className="h-1.5 rounded-full bg-surface-3" aria-label="No tickets yet" />;
	const pct = (n: number) => `${(n / total) * 100}%`;
	return (
		<div
			className="flex h-1.5 overflow-hidden rounded-full bg-surface-3"
			role="img"
			aria-label={`${done} done, ${inProgress} in progress, ${todo} to do`}
			title={`${done} done · ${inProgress} in progress · ${todo} to do`}
		>
			<span className="bg-glow" style={{ width: pct(done) }} />
			<span className="bg-v2-info" style={{ width: pct(inProgress) }} />
		</div>
	);
}
