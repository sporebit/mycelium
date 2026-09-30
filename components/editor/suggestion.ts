"use client";

/**
 * The suggestion list behind @ and #. Plain DOM rather than React: Tiptap
 * drives it through lifecycle callbacks outside the React tree, and a list
 * of a few buttons does not need a renderer. Keyboard: arrows move, Enter
 * or Tab picks, Escape closes. Text is set with textContent, never HTML.
 */
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";

export type SuggestItem = {
	/** A user or person id, or a ticket key. */
	id: string;
	label: string;
	hint?: string;
	kind: "user" | "person" | "ticket";
};

const KIND_LABEL: Record<SuggestItem["kind"], string> = { user: "Member", person: "Person", ticket: "" };

export function suggestionRenderer(title: string) {
	return () => {
		let root: HTMLDivElement | null = null;
		let list: HTMLDivElement | null = null;
		let unmount: (() => void) | null = null;
		let items: SuggestItem[] = [];
		let index = 0;
		let pick: ((item: SuggestItem) => void) | null = null;
		let loading = false;

		function paint() {
			if (!list) return;
			list.replaceChildren();
			if (items.length === 0) {
				const empty = document.createElement("p");
				empty.className = "work-suggest-empty";
				empty.textContent = loading ? "Searching…" : "Nothing matches.";
				list.append(empty);
				return;
			}
			items.forEach((item, i) => {
				const b = document.createElement("button");
				b.type = "button";
				b.className = `work-suggest-item${i === index ? " is-active" : ""}`;
				b.setAttribute("role", "option");
				b.setAttribute("aria-selected", String(i === index));
				const name = document.createElement("span");
				name.className = "work-suggest-label";
				name.textContent = item.kind === "ticket" ? `${item.id}  ${item.label}` : item.label;
				b.append(name);
				const hint = item.hint ?? KIND_LABEL[item.kind];
				if (hint) {
					const h = document.createElement("span");
					h.className = "work-suggest-hint";
					h.textContent = hint;
					b.append(h);
				}
				// mousedown, not click: the editor must not lose its selection first
				b.addEventListener("mousedown", (e) => {
					e.preventDefault();
					pick?.(item);
				});
				b.addEventListener("mouseenter", () => {
					index = i;
					paint();
				});
				list?.append(b);
			});
			list.querySelector(".is-active")?.scrollIntoView({ block: "nearest" });
		}

		function sync(props: SuggestionProps<SuggestItem, SuggestItem>) {
			items = props.items ?? [];
			loading = props.loading;
			pick = (item) => props.command(item);
			if (index >= items.length) index = 0;
			paint();
		}

		return {
			onStart(props: SuggestionProps<SuggestItem, SuggestItem>) {
				root = document.createElement("div");
				root.className = "work-suggest";
				root.setAttribute("role", "listbox");
				root.setAttribute("aria-label", title);
				const head = document.createElement("p");
				head.className = "work-suggest-title";
				head.textContent = title;
				list = document.createElement("div");
				root.append(head, list);
				index = 0;
				sync(props);
				unmount = props.mount(root);
			},
			onUpdate(props: SuggestionProps<SuggestItem, SuggestItem>) {
				sync(props);
			},
			onKeyDown({ event }: SuggestionKeyDownProps): boolean {
				if (event.key === "ArrowDown") {
					index = items.length === 0 ? 0 : (index + 1) % items.length;
					paint();
					return true;
				}
				if (event.key === "ArrowUp") {
					index = items.length === 0 ? 0 : (index - 1 + items.length) % items.length;
					paint();
					return true;
				}
				if (event.key === "Enter" || event.key === "Tab") {
					const item = items[index];
					if (!item) return false;
					pick?.(item);
					return true;
				}
				return false;
			},
			onExit() {
				unmount?.();
				root?.remove();
				root = null;
				list = null;
				unmount = null;
				pick = null;
			},
		};
	};
}
