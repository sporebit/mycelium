import { DocSpaceView } from "@/components/docs/DocSpaceView";

export default async function DocPageRoute({ params }: { params: Promise<{ space: string; page: string }> }) {
	const { space, page } = await params;
	return <DocSpaceView spaceKey={space} pageId={page} />;
}
