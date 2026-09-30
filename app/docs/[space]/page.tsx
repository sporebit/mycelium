import { DocSpaceView } from "@/components/docs/DocSpaceView";

export default async function DocSpacePage({ params }: { params: Promise<{ space: string }> }) {
	const { space } = await params;
	return <DocSpaceView spaceKey={space} pageId={null} />;
}
