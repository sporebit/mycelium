import { DocHistory } from "@/components/docs/DocHistory";

export default async function DocHistoryPage({ params }: { params: Promise<{ space: string; page: string }> }) {
	const { space, page } = await params;
	return <DocHistory spaceKey={space} pageId={page} />;
}
