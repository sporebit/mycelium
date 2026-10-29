import { GoustoRecipePage } from "@/components/health/gousto/GoustoRecipePage";

/** One Gousto recipe (0151): detail, heart, save to my recipes. */
export default async function GoustoRecipeRoute({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	return <GoustoRecipePage slug={slug} />;
}
