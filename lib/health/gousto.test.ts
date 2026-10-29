import { describe, expect, it } from "vitest";
import { mgToG, pickImage, safeStepHtml, slugOf, stripHtml, summariseEntry, toDetail, toRecipeRow } from "./gousto";

const media = { images: [{ image: "x200.jpg", width: 200 }, { image: "x400.jpg", width: 400 }, { image: "x1000.jpg", width: 1000 }] };

describe("gousto helpers", () => {
	it("takes the slug from either url shape", () => {
		expect(slugOf("/chicken-recipes/chicken-date-tamarind-curry")).toBe("chicken-date-tamarind-curry");
		expect(slugOf("/chicken-date-tamarind-curry/")).toBe("chicken-date-tamarind-curry");
	});

	it("picks the image at or above the wanted width, else the largest", () => {
		expect(pickImage(media, 400)).toBe("x400.jpg");
		expect(pickImage(media, 300)).toBe("x400.jpg");
		expect(pickImage(media, 5000)).toBe("x1000.jpg");
		expect(pickImage(undefined, 400)).toBeNull();
	});

	it("strips step html to lines and keeps only the safe tags", () => {
		const html = "<p>Boil a <strong>kettle</strong></p><p>Peel your <em>onion[s]</em><br>finely</p><script>x()</script>";
		expect(stripHtml(html)).toBe("Boil a kettle\nPeel your onion[s]\nfinely\nx()");
		expect(safeStepHtml(html)).toBe("<p>Boil a <strong>kettle</strong></p><p>Peel your <em>onion[s]</em><br>finely</p>x()");
	});

	it("summarises a listing entry without touching favourite or detail columns", () => {
		const row = summariseEntry(
			{ uid: "blt1", gousto_uid: "u1", title: " Curry ", media, rating: { average: 4.456, count: 12 }, prep_times: { for_2: 30 }, url: "/chicken-recipes/curry" },
			new Date("2026-10-29T00:00:00Z"),
		);
		expect(row.slug).toBe("curry");
		expect(row.title).toBe("Curry");
		expect(row.url).toBe("https://www.gousto.co.uk/cookbook/chicken-recipes/curry");
		expect(row.image_url).toBe("x400.jpg");
		expect(row.image_large_url).toBe("x1000.jpg");
		expect(row.rating_avg).toBe(4.46);
		expect(row.prep_for_4).toBeNull();
		expect("is_favourite" in row).toBe(false);
		expect("detail" in row).toBe(false);
	});

	it("keeps what the page needs from a detail and converts it into a recipes row", () => {
		const detail = toDetail({
			uid: "blt1",
			gousto_uid: "u1",
			title: "Curry",
			url: "/curry",
			description: "A curry.",
			cuisine: { title: "Indian" },
			categories: [{ title: "All Gousto Recipes" }, { title: "Chicken Recipes" }, { title: "Curry Recipes" }],
			ingredients: [{ label: "Tomato", media }, { label: "" }],
			basics: [{ title: "Salt" }],
			cooking_instructions: [
				{ order: 2, instruction: "<p>Second</p>" },
				{ order: 1, instruction: "<p>First <strong>step</strong></p>" },
			],
			allergens: [{ title: "Mustard" }, "Celery"],
			nutritional_information: { per_portion: { energy_kcal: 571, protein_mg: 33000 } },
			seo: { canonical: "https://www.gousto.co.uk/cookbook/chicken-recipes/curry" },
			portion_sizes: [{ portions: 2, is_offered: true }, { portions: 4, is_offered: false }],
		});
		expect(detail.steps.map((s) => s.text)).toEqual(["First step", "Second"]);
		expect(detail.ingredients).toEqual([{ label: "Tomato", image: "x200.jpg" }]);
		expect(detail.categories).toEqual(["Chicken", "Curry"]);
		expect(detail.allergens).toEqual(["Mustard", "Celery"]);
		expect(detail.portions).toEqual([2]);

		const recipe = toRecipeRow({ title: "Curry", url: "https://www.gousto.co.uk/cookbook/curry", image_large_url: "x1000.jpg", image_url: "x400.jpg", prep_for_2: 30, cuisine: null }, detail);
		expect(recipe.source_name).toBe("Gousto");
		expect(recipe.source_url).toBe("https://www.gousto.co.uk/cookbook/chicken-recipes/curry");
		expect(recipe.cuisine).toBe("Indian");
		expect(recipe.tags).toEqual(["gousto", "chicken", "curry"]);
		expect(recipe.ingredients).toEqual([
			{ amount: "", unit: null, name: "Tomato", notes: null },
			{ amount: "", unit: null, name: "Salt", notes: "from the cupboard" },
		]);
		expect(recipe.method).toEqual([
			{ step: 1, instruction: "First step" },
			{ step: 2, instruction: "Second" },
		]);
		expect(recipe.notes).toBe("A curry.\n\nAllergens: Mustard, Celery");
		expect(mgToG(33000)).toBe(33);
		expect(mgToG(13582)).toBe(13.6);
	});
});
