#!/usr/bin/env node
/**
 * Gousto cookbook sync (0151) — run from the PC, not from the cloud.
 *
 * Gousto's edge answers a bare nginx 502 to cloud egress (Vercel, US and
 * London alike) and sends no CORS headers, so Mycelium cannot fetch the
 * cookbook from production or from the browser. This script fetches it
 * from a residential connection and posts the raw payloads to Mycelium,
 * which shapes and stores them (lib/health/gousto.ts).
 *
 *   node scripts/gousto-sync.mjs                 listing + every missing detail
 *   node scripts/gousto-sync.mjs --listing-only  the 12k-row index only (~6 min)
 *   node scripts/gousto-sync.mjs --details-only  skip the listing; details only
 *   node scripts/gousto-sync.mjs --details 500   listing, then at most 500 details
 *   node scripts/gousto-sync.mjs --stale-days 30 also refresh details older than 30 days
 *   node scripts/gousto-sync.mjs --concurrency 3 parallel detail fetches (default 3)
 *
 * Env: MYCELIUM_URL (default https://mycelium.sporebit.com) and one of
 * MYCELIUM_API_SECRET / API_SECRET (the x-api-secret header, acts as Phil).
 * Node >= 18, no dependencies. Resumable: details are only fetched for
 * rows that lack one, so a stopped run picks up where it left off.
 */

const GOUSTO = "https://production-api.gousto.co.uk/cmsreadbroker/v1";
// Pages above ~50 entries (~1 MB) come back as a bare nginx 502 from Gousto's
// edge — an upstream buffer limit, not a block. 50 is the safe size.
const PAGE = 50;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => {
	const i = args.indexOf(name);
	return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};

const base = (process.env.MYCELIUM_URL ?? "https://mycelium.sporebit.com").replace(/\/+$/, "");
const secret = process.env.MYCELIUM_API_SECRET ?? process.env.API_SECRET;
if (!secret) {
	console.error("Set MYCELIUM_API_SECRET (or API_SECRET) — the x-api-secret header.");
	process.exit(2);
}
const listingOnly = flag("--listing-only");
const detailsOnly = flag("--details-only");
const detailsCap = Number(opt("--details", "0")) || 0; // 0 = all missing
const staleDays = Number(opt("--stale-days", "0")) || 0;
const concurrency = Math.max(1, Math.min(6, Number(opt("--concurrency", "3")) || 3));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gousto(path, attempt = 1) {
	const res = await fetch(`${GOUSTO}${path}`, { headers: { accept: "application/json", "user-agent": UA } });
	if (res.status === 404) return null;
	if (res.status === 429 || res.status >= 500) {
		if (attempt >= 4) throw new Error(`Gousto ${res.status} on ${path}`);
		await sleep(1500 * attempt);
		return gousto(path, attempt + 1);
	}
	if (!res.ok) throw new Error(`Gousto ${res.status} on ${path}`);
	const json = await res.json();
	if (json.status !== "ok" || !json.data) throw new Error(`Gousto answered "${json.status}" on ${path}`);
	return json.data;
}

async function mycelium(method, path, body) {
	const res = await fetch(`${base}${path}`, {
		method,
		headers: { "x-api-secret": secret, "content-type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const json = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${json.error ?? ""}`.trim());
	return json;
}

const slugOf = (e) => (e.url ?? "").split("/").filter(Boolean).pop() ?? "";

async function syncListing() {
	let offset = 0;
	let total = null;
	let seen = 0;
	// a re-issued recipe appears under two uids with the same slug; the
	// most-rated entry is the live page, whichever page of the listing it is on
	const best = new Map();
	const t0 = Date.now();
	for (;;) {
		const data = await gousto(`/recipes?limit=${PAGE}&offset=${offset}`);
		const all = data?.entries ?? [];
		total = data?.count ?? total ?? 0;
		if (all.length === 0) break;
		const entries = all.filter((e) => {
			const s = slugOf(e);
			const n = e.rating?.count ?? 0;
			if (best.has(s) && best.get(s) >= n) return false;
			best.set(s, n);
			return true;
		});
		const out = entries.length ? await mycelium("POST", "/api/health/gousto/ingest", { entries }) : { total: "-" };
		seen += all.length;
		offset += all.length;
		process.stdout.write(`\rlisting ${Math.min(seen, total)}/${total} (stored ${out.total})   `);
		if (all.length < PAGE || offset >= total) break;
	}
	console.log(`\nlisting done: ${seen} entries in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

async function syncDetails() {
	const t0 = Date.now();
	let done = 0;
	let gone = 0;
	let failed = 0;
	const cap = detailsCap > 0 ? detailsCap : Infinity;
	for (;;) {
		const want = Math.min(500, cap - done);
		if (want <= 0) break;
		const q = `limit=${want}${staleDays > 0 ? `&stale_days=${staleDays}` : ""}`;
		const { slugs, remaining } = await mycelium("GET", `/api/health/gousto/missing?${q}`);
		if (slugs.length === 0) break;
		let i = 0;
		await Promise.all(
			Array.from({ length: concurrency }, async () => {
				while (i < slugs.length) {
					const slug = slugs[i++];
					try {
						const data = await gousto(`/recipe/${encodeURIComponent(slug)}`);
						const entry = data?.entry ?? null;
						await mycelium("PUT", `/api/health/gousto/${encodeURIComponent(slug)}/detail`, { entry });
						if (entry) done += 1;
						else gone += 1;
					} catch (err) {
						failed += 1;
						console.error(`\n${slug}: ${err.message}`);
						// a detail that keeps failing would loop forever: stamp it so the next pass skips it
						if (failed > 25) throw new Error("too many detail failures; stopping");
					}
					process.stdout.write(`\rdetails ${done + gone}/${Math.min(remaining, cap)} (${gone} gone, ${failed} failed)   `);
					await sleep(120);
				}
			}),
		);
		if (slugs.length < want) break;
	}
	console.log(`\ndetails done: ${done} fetched, ${gone} no longer on Gousto, ${failed} failed, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

(async () => {
	console.log(`Gousto → ${base}`);
	if (!detailsOnly) await syncListing();
	if (!listingOnly) await syncDetails();
})().catch((err) => {
	console.error(`\n${err.message}`);
	process.exit(1);
});
