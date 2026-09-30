"use client";

/**
 * Work — pickers. One popover, one searchable option list, used by the
 * filter bar, the issue page's side panel and the settings pages. Keyboard:
 * the trigger opens with Enter / Space / ArrowDown, arrows move, Enter
 * picks, Escape closes and returns focus to the trigger.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronDown, X } from "lucide-react";

export type Option = { value: string; label: string; hint?: string; colour?: string | null; icon?: ReactNode; group?: string };

function useOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void, active: boolean) {
	useEffect(() => {
		if (!active) return;
		function down(e: MouseEvent) {
			if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
		}
		document.addEventListener("mousedown", down);
		return () => document.removeEventListener("mousedown", down);
	}, [ref, onOutside, active]);
}

type PickerProps = {
	label: string;
	options: Option[];
	/** Shown on the trigger when nothing is chosen. */
	placeholder?: string;
	/** Offer to create an option from the search text (labels). */
	onCreate?: (text: string) => void | Promise<void>;
	disabled?: boolean;
	/** "chip" = the filter bar's compact trigger; "field" = a form control. */
	variant?: "chip" | "field";
	align?: "left" | "right";
	searchable?: boolean;
};

type MultiProps = PickerProps & { multiple: true; value: string[]; onChange: (next: string[]) => void };
type SingleProps = PickerProps & { multiple?: false; value: string | null; onChange: (next: string | null) => void; clearable?: boolean };

export function Picker(props: MultiProps | SingleProps) {
	const { label, options, placeholder, onCreate, disabled = false, variant = "field", align = "left", searchable } = props;
	const [open, setOpen] = useState(false);
	const [text, setText] = useState("");
	const [cursor, setCursor] = useState(0);
	const root = useRef<HTMLDivElement | null>(null);
	const trigger = useRef<HTMLButtonElement | null>(null);
	const input = useRef<HTMLInputElement | null>(null);
	const listId = useId();

	const selected = useMemo(() => new Set(props.multiple ? props.value : props.value ? [props.value] : []), [props.multiple, props.value]);
	const showSearch = searchable ?? (options.length > 7 || !!onCreate);

	const close = useCallback((refocus = false) => {
		setOpen(false);
		setText("");
		setCursor(0);
		if (refocus) trigger.current?.focus();
	}, []);
	useOutside(root, () => close(false), open);

	const shown = useMemo(() => {
		const t = text.trim().toLowerCase();
		return t ? options.filter((o) => o.label.toLowerCase().includes(t) || (o.hint ?? "").toLowerCase().includes(t)) : options;
	}, [options, text]);
	const canCreate = !!onCreate && text.trim() !== "" && !options.some((o) => o.label.toLowerCase() === text.trim().toLowerCase());
	const rows = shown.length + (canCreate ? 1 : 0);

	useEffect(() => {
		if (open) input.current?.focus();
	}, [open]);

	function pick(o: Option) {
		if (props.multiple) {
			const next = selected.has(o.value) ? props.value.filter((v) => v !== o.value) : [...props.value, o.value];
			props.onChange(next);
		} else {
			props.onChange(o.value);
			close(true);
		}
	}

	async function create() {
		const t = text.trim();
		if (!t || !onCreate) return;
		await onCreate(t);
		setText("");
		setCursor(0);
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === "Escape") {
			e.preventDefault();
			close(true);
		} else if (e.key === "ArrowDown") {
			e.preventDefault();
			setCursor((c) => (rows === 0 ? 0 : (c + 1) % rows));
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setCursor((c) => (rows === 0 ? 0 : (c - 1 + rows) % rows));
		} else if (e.key === "Enter") {
			e.preventDefault();
			if (cursor < shown.length) pick(shown[cursor]);
			else if (canCreate) void create();
		}
	}

	const chosen = options.filter((o) => selected.has(o.value));
	const summary = chosen.length === 0 ? (placeholder ?? "Any") : chosen.length === 1 ? chosen[0].label : `${chosen[0].label} +${chosen.length - 1}`;
	const active = chosen.length > 0;

	const triggerClass =
		variant === "chip"
			? `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
					active ? "border-glow-dim/60 bg-glow-wash text-text-hi" : "border-hairline-strong bg-surface-1 text-text-mid hover:text-text-hi"
				}`
			: "flex w-full items-center justify-between gap-2 rounded-v2-md border border-hairline-strong bg-surface-0 px-3 py-2 text-left text-sm text-text-hi hover:border-glow-dim/60";

	return (
		<div ref={root} className={`relative ${variant === "field" ? "w-full" : "inline-block"}`}>
			<button
				ref={trigger}
				type="button"
				disabled={disabled}
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-controls={open ? listId : undefined}
				onClick={() => (open ? close(false) : setOpen(true))}
				onKeyDown={(e) => {
					if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
						e.preventDefault();
						setOpen(true);
					}
				}}
				className={`${triggerClass} disabled:cursor-not-allowed disabled:opacity-50`}
			>
				<span className="truncate">
					{variant === "chip" && <span className="text-text-lo">{label}: </span>}
					<span className={active ? "" : "text-text-lo"}>{summary}</span>
				</span>
				<ChevronDown size={12} aria-hidden className="shrink-0 text-text-lo" />
			</button>

			{open && (
				<div
					className={`absolute z-40 mt-1 w-64 max-w-[80vw] rounded-v2-md border border-hairline-strong bg-surface-2 p-1 shadow-xl ${align === "right" ? "right-0" : "left-0"}`}
					onKeyDown={onKey}
				>
					{showSearch && (
						<input
							ref={input}
							value={text}
							onChange={(e) => {
								setText(e.target.value);
								setCursor(0);
							}}
							placeholder={onCreate ? "Search or add…" : "Search…"}
							aria-label={`Search ${label}`}
							className="mb-1 w-full rounded-v2-sm border border-hairline bg-surface-0 px-2 py-1.5 text-sm text-text-hi placeholder:text-text-lo focus:border-glow-dim focus:outline-none"
						/>
					)}
					<ul id={listId} role="listbox" aria-label={label} aria-multiselectable={props.multiple || undefined} tabIndex={showSearch ? -1 : 0} ref={(el) => {
						if (el && open && !showSearch) el.focus();
					}} className="max-h-64 overflow-y-auto focus:outline-none">
						{!props.multiple && props.clearable && active && (
							<li>
								<button
									type="button"
									onClick={() => {
										props.onChange(null);
										close(true);
									}}
									className="flex w-full items-center gap-2 rounded-v2-sm px-2 py-1.5 text-left text-sm text-text-mid hover:bg-surface-3"
								>
									<X size={12} aria-hidden /> Clear
								</button>
							</li>
						)}
						{shown.map((o, i) => {
							const header = i === 0 || shown[i - 1].group !== o.group ? o.group : undefined;
							const on = selected.has(o.value);
							return (
								<li key={o.value} role="presentation">
									{header && <p className="px-2 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-lo">{header}</p>}
									<button
										type="button"
										role="option"
										aria-selected={on}
										onMouseEnter={() => setCursor(i)}
										onClick={() => pick(o)}
										className={`flex w-full items-center gap-2 rounded-v2-sm px-2 py-1.5 text-left text-sm ${i === cursor ? "bg-surface-3" : ""} ${on ? "text-text-hi" : "text-text-mid"}`}
									>
										<span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">{on && <Check size={12} aria-hidden className="text-glow" />}</span>
										{o.icon}
										{o.colour && <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: o.colour }} />}
										<span className="min-w-0 flex-1 truncate">{o.label}</span>
										{o.hint && <span className="shrink-0 text-[11px] text-text-lo">{o.hint}</span>}
									</button>
								</li>
							);
						})}
						{canCreate && (
							<li>
								<button
									type="button"
									onMouseEnter={() => setCursor(shown.length)}
									onClick={() => void create()}
									className={`flex w-full items-center gap-2 rounded-v2-sm px-2 py-1.5 text-left text-sm text-glow ${cursor === shown.length ? "bg-surface-3" : ""}`}
								>
									Add “{text.trim()}”
								</button>
							</li>
						)}
						{rows === 0 && <li className="px-2 py-2 text-sm text-text-lo">Nothing matches.</li>}
					</ul>
					{props.multiple && active && (
						<button type="button" onClick={() => props.onChange([])} className="mt-1 w-full rounded-v2-sm px-2 py-1.5 text-left text-xs text-text-lo hover:bg-surface-3 hover:text-text-hi">
							Clear {label.toLowerCase()}
						</button>
					)}
				</div>
			)}
		</div>
	);
}

/** A modal dialog: focus moves in, Escape and the backdrop close it, focus returns. */
export function Dialog({ title, open, onClose, children, footer, wide = false }: { title: string; open: boolean; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
	const panel = useRef<HTMLDivElement | null>(null);
	const titleId = useId();
	useEffect(() => {
		if (!open) return;
		const before = document.activeElement as HTMLElement | null;
		const first = panel.current?.querySelector<HTMLElement>("input, textarea, select, button, [tabindex]:not([tabindex='-1'])");
		(first ?? panel.current)?.focus();
		function key(e: globalThis.KeyboardEvent) {
			if (e.key === "Escape") onClose();
		}
		document.addEventListener("keydown", key);
		return () => {
			document.removeEventListener("keydown", key);
			before?.focus?.();
		};
	}, [open, onClose]);
	if (!open) return null;
	return (
		<div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
			<div
				ref={panel}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				tabIndex={-1}
				className={`w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-v2-lg border border-hairline-strong bg-surface-1 shadow-2xl focus:outline-none`}
			>
				<div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
					<h2 id={titleId} className="text-sm font-semibold text-text-hi">
						{title}
					</h2>
					<button type="button" onClick={onClose} aria-label="Close" className="rounded-v2-sm p-1 text-text-lo hover:bg-surface-3 hover:text-text-hi">
						<X size={16} aria-hidden />
					</button>
				</div>
				<div className="px-4 py-4">{children}</div>
				{footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-hairline px-4 py-3">{footer}</div>}
			</div>
		</div>
	);
}
