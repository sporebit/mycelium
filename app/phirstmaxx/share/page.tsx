import { Shell } from "@/components/dashboard/Shell";
import { Share } from "@/components/phirstmaxx/Share";

export const dynamic = "force-dynamic";

type Params = { saved?: string; error?: string; url?: string; text?: string; title?: string };
const str = (v: string | undefined, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/**
 * /phirstmaxx/share — the installed app's share target landing (spec §5).
 * A GET share carries ?url=&text=&title= and is saved from the page; a POST
 * share went through /api/phirstmaxx/share and arrives as ?saved=<id>.
 */
export default async function PhirstMaxxSharePage({ searchParams }: { searchParams: Promise<Params> }) {
  const p = await searchParams;
  return (
    <Shell>
      <Share saved={p.saved && /^[0-9a-f-]{36}$/i.test(p.saved) ? p.saved : null} error={str(p.error, 300)} url={str(p.url, 2000)} text={str(p.text, 5000)} title={str(p.title, 300)} />
    </Shell>
  );
}
