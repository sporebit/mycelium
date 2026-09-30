import { redirect } from "next/navigation";

/** Telegram messages, commit links and tix output still name this URL; the issue lives at /work/browse/[key]. */
export default async function TicketRedirect({ params }: { params: Promise<{ key: string }> }) {
	const { key } = await params;
	redirect(`/work/browse/${encodeURIComponent(key)}`);
}
