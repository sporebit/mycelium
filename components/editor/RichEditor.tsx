"use client";

/**
 * The one rich editor (claude/spec-work.md Part C, W9): ticket descriptions,
 * comments and doc pages. It works in Tiptap JSON; the plain-text rendition
 * every other part of the app reads is derived on the server from the same
 * document (lib/work/doc.ts), so nothing here is trusted for it.
 *
 * `value` seeds the editor once. To load different content into a mounted
 * editor (another page, a restored version) change `docKey`.
 */
import { useEffect, useMemo, useRef } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import {
	Bold,
	Code,
	Heading2,
	Heading3,
	Italic,
	Link2,
	List,
	ListChecks,
	ListOrdered,
	Minus,
	Quote,
	Redo2,
	SquareCode,
	Strikethrough,
	Undo2,
	type LucideIcon,
} from "lucide-react";
import { docToText, isDoc, textToDoc, type Doc } from "@/lib/work/doc";
import { editorExtensions } from "./extensions";
import { defaultSources } from "./sources";

export type RichEditorProps = {
	/** The stored document; when null the editor opens from `fallbackText`. */
	value: unknown;
	fallbackText?: string | null;
	onChange?: (doc: Doc, text: string) => void;
	/** Ctrl/⌘ + Enter. */
	onSubmit?: () => void;
	placeholder?: string;
	editable?: boolean;
	/** "page" = headings and a taller body; "comment" = compact, no headings. */
	variant?: "page" | "field" | "comment";
	docKey?: string;
	ariaLabel?: string;
	autoFocus?: boolean;
};

function ToolButton({ editor, icon: Icon, label, active, run, disabled }: { editor: Editor; icon: LucideIcon; label: string; active?: boolean; run: () => void; disabled?: boolean }) {
	return (
		<button
			type="button"
			title={label}
			aria-label={label}
			aria-pressed={active === undefined ? undefined : active}
			disabled={disabled || !editor.isEditable}
			// keep the selection: act on mousedown, before the editor blurs
			onMouseDown={(e) => {
				e.preventDefault();
				run();
			}}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					run();
				}
			}}
			className={`inline-flex h-7 w-7 items-center justify-center rounded-v2-sm transition-colors disabled:opacity-40 ${
				active ? "bg-surface-3 text-glow" : "text-text-mid hover:bg-surface-3 hover:text-text-hi"
			}`}
		>
			<Icon size={14} aria-hidden />
		</button>
	);
}

function Toolbar({ editor, headings }: { editor: Editor; headings: boolean }) {
	function link() {
		const current = (editor.getAttributes("link").href as string | undefined) ?? "";
		const url = window.prompt("Link address", current || "https://");
		if (url === null) return;
		const href = url.trim();
		if (!href || href === "https://") {
			editor.chain().focus().extendMarkRange("link").unsetLink().run();
			return;
		}
		if (!/^(https?:\/\/|mailto:)/i.test(href)) {
			window.alert("Links start with http://, https:// or mailto:");
			return;
		}
		editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
	}
	const sep = <span aria-hidden className="mx-0.5 h-4 w-px bg-hairline-strong" />;
	return (
		<div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 border-b border-hairline px-1.5 py-1">
			<ToolButton editor={editor} icon={Bold} label="Bold (Ctrl+B)" active={editor.isActive("bold")} run={() => editor.chain().focus().toggleBold().run()} />
			<ToolButton editor={editor} icon={Italic} label="Italic (Ctrl+I)" active={editor.isActive("italic")} run={() => editor.chain().focus().toggleItalic().run()} />
			<ToolButton editor={editor} icon={Strikethrough} label="Strikethrough" active={editor.isActive("strike")} run={() => editor.chain().focus().toggleStrike().run()} />
			<ToolButton editor={editor} icon={Code} label="Inline code" active={editor.isActive("code")} run={() => editor.chain().focus().toggleCode().run()} />
			<ToolButton editor={editor} icon={Link2} label="Link" active={editor.isActive("link")} run={link} />
			{sep}
			{headings && (
				<>
					<ToolButton editor={editor} icon={Heading2} label="Heading" active={editor.isActive("heading", { level: 2 })} run={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
					<ToolButton editor={editor} icon={Heading3} label="Sub-heading" active={editor.isActive("heading", { level: 3 })} run={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
				</>
			)}
			<ToolButton editor={editor} icon={List} label="Bulleted list" active={editor.isActive("bulletList")} run={() => editor.chain().focus().toggleBulletList().run()} />
			<ToolButton editor={editor} icon={ListOrdered} label="Numbered list" active={editor.isActive("orderedList")} run={() => editor.chain().focus().toggleOrderedList().run()} />
			<ToolButton editor={editor} icon={ListChecks} label="Checklist" active={editor.isActive("taskList")} run={() => editor.chain().focus().toggleTaskList().run()} />
			<ToolButton editor={editor} icon={Quote} label="Quote" active={editor.isActive("blockquote")} run={() => editor.chain().focus().toggleBlockquote().run()} />
			<ToolButton editor={editor} icon={SquareCode} label="Code block" active={editor.isActive("codeBlock")} run={() => editor.chain().focus().toggleCodeBlock().run()} />
			<ToolButton editor={editor} icon={Minus} label="Divider" run={() => editor.chain().focus().setHorizontalRule().run()} />
			{sep}
			<ToolButton editor={editor} icon={Undo2} label="Undo (Ctrl+Z)" disabled={!editor.can().undo()} run={() => editor.chain().focus().undo().run()} />
			<ToolButton editor={editor} icon={Redo2} label="Redo (Ctrl+Shift+Z)" disabled={!editor.can().redo()} run={() => editor.chain().focus().redo().run()} />
		</div>
	);
}

export function RichEditor({
	value,
	fallbackText = null,
	onChange,
	onSubmit,
	placeholder,
	editable = true,
	variant = "field",
	docKey = "",
	ariaLabel = "Text",
	autoFocus = false,
}: RichEditorProps) {
	const headings = variant !== "comment";
	const initial = useMemo<Doc>(() => (isDoc(value) ? value : textToDoc(fallbackText)), [value, fallbackText]);

	// the callbacks change identity every render; the editor is made once
	const onChangeRef = useRef(onChange);
	const onSubmitRef = useRef(onSubmit);
	useEffect(() => {
		onChangeRef.current = onChange;
		onSubmitRef.current = onSubmit;
	}, [onChange, onSubmit]);

	const extensions = useMemo(() => editorExtensions({ placeholder, headings, sources: defaultSources }), [placeholder, headings]);

	const editor = useEditor(
		{
			extensions,
			content: initial,
			editable,
			autofocus: autoFocus ? "end" : false,
			// the server renders nothing for the editor: it mounts on the client
			immediatelyRender: false,
			editorProps: {
				attributes: {
					class: `work-doc work-doc-${variant} focus:outline-none`,
					role: "textbox",
					"aria-multiline": "true",
					"aria-label": ariaLabel,
				},
				handleKeyDown: (_view, event) => {
					if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && onSubmitRef.current) {
						event.preventDefault();
						onSubmitRef.current();
						return true;
					}
					return false;
				},
			},
			onUpdate: ({ editor: e }) => {
				const doc = e.getJSON() as Doc;
				onChangeRef.current?.(doc, docToText(doc));
			},
		},
		[docKey, extensions],
	);

	useEffect(() => {
		if (editor && editor.isEditable !== editable) editor.setEditable(editable);
	}, [editor, editable]);

	if (!editor) {
		return <div className={`work-doc-shell work-doc-shell-${variant}`} aria-busy="true" />;
	}
	return (
		<div className={`work-doc-shell work-doc-shell-${variant} ${editable ? "is-editable" : ""}`}>
			{editable && <Toolbar editor={editor} headings={headings} />}
			<EditorContent editor={editor} />
		</div>
	);
}

/** Empty an editor after its content has been sent (the comment box). */
export function isEmptyDoc(doc: unknown): boolean {
	return !isDoc(doc) || docToText(doc).trim() === "";
}
