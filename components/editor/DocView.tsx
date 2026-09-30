/**
 * Read-only rendering of a stored document (claude/spec-work.md Part C):
 * comment lists, the issue page when nobody is editing, page history. It
 * walks the same node shapes the editor makes and lib/work/doc.ts reads,
 * without loading Tiptap. A document it does not recognise falls back to
 * the plain text.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { docToText, isDoc, type DocNode } from "@/lib/work/doc";

const HEADING_CLASS: Record<number, string> = { 1: "work-h1", 2: "work-h2", 3: "work-h3" };

function marked(text: string, marks: DocNode["marks"], key: number): ReactNode {
	let out: ReactNode = text;
	for (const m of marks ?? []) {
		switch (m.type) {
			case "bold":
				out = <strong key={`${key}b`}>{out}</strong>;
				break;
			case "italic":
				out = <em key={`${key}i`}>{out}</em>;
				break;
			case "strike":
				out = <s key={`${key}s`}>{out}</s>;
				break;
			case "code":
				out = <code key={`${key}c`}>{out}</code>;
				break;
			case "underline":
				out = <u key={`${key}u`}>{out}</u>;
				break;
			case "link": {
				const href = String(m.attrs?.href ?? "");
				if (/^(https?:|mailto:)/i.test(href)) {
					out = (
						<a key={`${key}l`} href={href} target="_blank" rel="noopener noreferrer nofollow">
							{out}
						</a>
					);
				}
				break;
			}
		}
	}
	return out;
}

function Inline({ nodes }: { nodes: DocNode[] | undefined }) {
	return (
		<>
			{(nodes ?? []).map((n, i) => {
				if (n.type === "text") return <span key={i}>{marked(n.text ?? "", n.marks, i)}</span>;
				if (n.type === "hardBreak") return <br key={i} />;
				if (n.type === "mention") {
					const kind = n.attrs?.kind === "person" ? "person" : "user";
					const label = `@${String(n.attrs?.label ?? "someone")}`;
					const id = String(n.attrs?.id ?? "");
					return kind === "person" && id ? (
						<Link key={i} href={`/organisation/people/${encodeURIComponent(id)}`} className="work-chip work-chip-person">
							{label}
						</Link>
					) : (
						<span key={i} className={`work-chip work-chip-${kind}`}>
							{label}
						</span>
					);
				}
				if (n.type === "ticketKey") {
					const key = String(n.attrs?.key ?? "");
					return (
						<Link key={i} href={`/work/browse/${encodeURIComponent(key)}`} className="work-chip work-chip-ticket">
							{key}
						</Link>
					);
				}
				return <Block key={i} node={n} />;
			})}
		</>
	);
}

function Block({ node }: { node: DocNode }) {
	switch (node.type) {
		case "paragraph":
			return (
				<p>
					<Inline nodes={node.content} />
				</p>
			);
		case "heading": {
			const level = Number(node.attrs?.level ?? 2);
			const cls = HEADING_CLASS[level] ?? "work-h3";
			const inner = <Inline nodes={node.content} />;
			if (level === 1) return <h2 className={cls}>{inner}</h2>;
			if (level === 2) return <h3 className={cls}>{inner}</h3>;
			return <h4 className={cls}>{inner}</h4>;
		}
		case "bulletList":
			return (
				<ul>
					<Blocks nodes={node.content} />
				</ul>
			);
		case "orderedList":
			return (
				<ol start={typeof node.attrs?.start === "number" ? node.attrs.start : undefined}>
					<Blocks nodes={node.content} />
				</ol>
			);
		case "listItem":
			return (
				<li>
					<Blocks nodes={node.content} />
				</li>
			);
		case "taskList":
			return (
				<ul data-type="taskList">
					<Blocks nodes={node.content} />
				</ul>
			);
		case "taskItem":
			return (
				<li data-type="taskItem" data-checked={node.attrs?.checked ? "true" : "false"}>
					<label>
						<input type="checkbox" checked={!!node.attrs?.checked} readOnly tabIndex={-1} aria-label={node.attrs?.checked ? "Done" : "Not done"} />
					</label>
					<div>
						<Blocks nodes={node.content} />
					</div>
				</li>
			);
		case "blockquote":
			return (
				<blockquote>
					<Blocks nodes={node.content} />
				</blockquote>
			);
		case "codeBlock":
			return (
				<pre>
					<code>{(node.content ?? []).map((c) => c.text ?? "").join("")}</code>
				</pre>
			);
		case "horizontalRule":
			return <hr />;
		case "hardBreak":
			return <br />;
		case "text":
			return <>{marked(node.text ?? "", node.marks, 0)}</>;
		default:
			return node.content ? <Blocks nodes={node.content} /> : null;
	}
}

function Blocks({ nodes }: { nodes: DocNode[] | undefined }) {
	return (
		<>
			{(nodes ?? []).map((n, i) => (
				<Block key={i} node={n} />
			))}
		</>
	);
}

export function DocView({ doc, text, variant = "field", className = "" }: { doc: unknown; text?: string | null; variant?: "page" | "field" | "comment"; className?: string }) {
	if (isDoc(doc) && doc.content.length > 0) {
		return (
			<div className={`work-doc work-doc-${variant} work-doc-static ${className}`}>
				<Blocks nodes={doc.content} />
			</div>
		);
	}
	const plain = (isDoc(doc) ? docToText(doc) : text ?? "").trim();
	if (!plain) return null;
	return (
		<div className={`work-doc work-doc-${variant} work-doc-static ${className}`}>
			{plain.split(/\n{2,}/).map((para, i) => (
				<p key={i} className="whitespace-pre-wrap">
					{para}
				</p>
			))}
		</div>
	);
}
