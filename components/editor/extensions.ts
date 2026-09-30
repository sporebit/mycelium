"use client";

/**
 * The one rich editor's extensions (claude/spec-work.md Part C, W9).
 *
 * Two chips beyond the starter kit, both stored as the node shapes
 * lib/work/doc.ts reads:
 *   mention    @  { kind: "user" | "person", id, label }
 *   ticketKey  #  { key }   — also made by typing or pasting a key (MYC-12)
 * A user mention notifies; a person mention is a record in People.
 */
import { InputRule, mergeAttributes, PasteRule, type Extensions } from "@tiptap/core";
import { Mention } from "@tiptap/extension-mention";
import { Placeholder } from "@tiptap/extension-placeholder";
import { TaskItem } from "@tiptap/extension-task-item";
import { TaskList } from "@tiptap/extension-task-list";
import { StarterKit } from "@tiptap/starter-kit";
import { suggestionRenderer, type SuggestItem } from "./suggestion";

const KEY = "[A-Z][A-Z0-9]{1,4}-\\d+";

export type EditorSources = {
	people: (query: string, signal: AbortSignal) => Promise<SuggestItem[]>;
	tickets: (query: string, signal: AbortSignal) => Promise<SuggestItem[]>;
};

const PersonMention = Mention.extend({
	name: "mention",
	addAttributes() {
		return {
			id: { default: null, parseHTML: (el) => el.getAttribute("data-id"), renderHTML: (a) => ({ "data-id": a.id }) },
			label: { default: null, parseHTML: (el) => el.getAttribute("data-label"), renderHTML: (a) => ({ "data-label": a.label }) },
			kind: { default: "user", parseHTML: (el) => el.getAttribute("data-kind") ?? "user", renderHTML: (a) => ({ "data-kind": a.kind }) },
		};
	},
	parseHTML() {
		return [{ tag: "span[data-type='mention']" }];
	},
	renderHTML({ node, HTMLAttributes }) {
		return ["span", mergeAttributes({ "data-type": "mention", class: `work-chip work-chip-${node.attrs.kind === "person" ? "person" : "user"}` }, HTMLAttributes), `@${node.attrs.label ?? "someone"}`];
	},
	renderText({ node }) {
		return `@${node.attrs.label ?? "someone"}`;
	},
});

const TicketKey = Mention.extend({
	name: "ticketKey",
	addAttributes() {
		return {
			key: { default: null, parseHTML: (el) => el.getAttribute("data-key"), renderHTML: (a) => ({ "data-key": a.key }) },
		};
	},
	parseHTML() {
		return [{ tag: "span[data-type='ticketKey']" }];
	},
	renderHTML({ node, HTMLAttributes }) {
		return ["span", mergeAttributes({ "data-type": "ticketKey", class: "work-chip work-chip-ticket" }, HTMLAttributes), String(node.attrs.key ?? "")];
	},
	renderText({ node }) {
		return String(node.attrs.key ?? "");
	},
	addInputRules() {
		return [
			new InputRule({
				// a key, then a space or punctuation: "MYC-12 " becomes the chip and keeps what was typed after it
				find: new RegExp(`(?:^|\\s)(${KEY})([\\s.,;:!?)])$`),
				handler: ({ state, range, match }) => {
					const key = match[1];
					const from = range.to - key.length - match[2].length;
					state.tr.replaceWith(from, range.to, [this.type.create({ key }), state.schema.text(match[2])]);
				},
			}),
		];
	},
	addPasteRules() {
		return [
			new PasteRule({
				find: new RegExp(`\\b${KEY}\\b`, "g"),
				handler: ({ state, range, match }) => {
					state.tr.replaceWith(range.from, range.to, this.type.create({ key: match[0] }));
				},
			}),
		];
	},
});

export function editorExtensions(opts: { placeholder?: string; sources: EditorSources; headings?: boolean }): Extensions {
	return [
		StarterKit.configure({
			heading: opts.headings === false ? false : { levels: [1, 2, 3] },
			link: { openOnClick: false, autolink: true, protocols: ["http", "https", "mailto"], HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" } },
		}),
		TaskList,
		TaskItem.configure({ nested: true }),
		Placeholder.configure({ placeholder: opts.placeholder ?? "Write something. @ mentions a person, # links a ticket." }),
		PersonMention.configure({
			deleteTriggerWithBackspace: true,
			suggestion: {
				char: "@",
				allowSpaces: false,
				debounce: 120,
				items: ({ query, signal }) => opts.sources.people(query, signal),
				command: ({ editor, range, props }) => {
					const item = props as unknown as SuggestItem;
					editor
						.chain()
						.focus()
						.insertContentAt(range, [{ type: "mention", attrs: { id: item.id, label: item.label, kind: item.kind === "person" ? "person" : "user" } }, { type: "text", text: " " }])
						.run();
				},
				render: suggestionRenderer("People"),
			},
		}),
		TicketKey.configure({
			deleteTriggerWithBackspace: true,
			suggestion: {
				char: "#",
				allowSpaces: false,
				debounce: 180,
				items: ({ query, signal }) => opts.sources.tickets(query, signal),
				command: ({ editor, range, props }) => {
					const item = props as unknown as SuggestItem;
					editor
						.chain()
						.focus()
						.insertContentAt(range, [{ type: "ticketKey", attrs: { key: item.id } }, { type: "text", text: " " }])
						.run();
				},
				render: suggestionRenderer("Tickets"),
			},
		}),
	];
}
