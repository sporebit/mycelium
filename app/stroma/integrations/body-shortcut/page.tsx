import { Shell } from "@/components/dashboard/Shell";
import { StromaSubNav } from "@/components/stroma/StromaSubNav";
import { Panel } from "@/components/dashboard/Panel";
import { Mono } from "@/components/dashboard/Mono";
import { SecretCopy } from "@/components/fitness/SecretCopy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function BodyShortcutSetupPage() {
  const secret = process.env.API_SECRET ?? "(API_SECRET env var missing)";
  const baseUrl = (
    process.env.SHORTCUT_AUDIO_URL?.replace(/\/api\/.*$/, "") ||
    "https://mycelium.sporebit.com"
  ).replace(/\/$/, "");
  const url = `${baseUrl}/api/health/body-metrics`;

  return (
    <Shell active="STROMA">
      <StromaSubNav />
      <div className="flex flex-col gap-4 max-w-2xl">
        <h1 className="text-2xl italic font-[family-name:var(--font-display)] text-ink-4">
          iOS Shortcut — Body metrics
        </h1>
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] leading-relaxed">
          Reads the latest weight + body fat % from Apple Health and posts
          them to Mycelium. Run it after stepping off your scale — or
          schedule it daily via Personal Automations.
        </p>

        <Panel title="Your API secret" topRight={<Mono>copy me</Mono>}>
          <SecretCopy value={secret} label="X-API-Secret" />
          <p className="text-[11px] text-ink-3 mt-2 italic font-[family-name:var(--font-display)]">
            Same secret as the capture Shortcut. Don&apos;t paste it anywhere
            public, including screenshots.
          </p>
        </Panel>

        <Panel title="Endpoint" topRight={<Mono>POST</Mono>}>
          <SecretCopy value={url} label="URL" />
        </Panel>

        <Panel title="Steps">
          <ol className="flex flex-col gap-4">
            <Step
              n={1}
              title="Find Health Samples — Weight"
              body={
                <>
                  Add <Mono>Find Health Samples</Mono> with:
                  <ul className="mt-1 list-disc list-inside text-[13px] text-ink-3">
                    <li>Category: <Mono>Body Measurements</Mono></li>
                    <li>Sample Type: <Mono>Weight</Mono></li>
                    <li>Sort by: <Mono>Date</Mono> · Order: <Mono>Latest First</Mono></li>
                    <li>Limit: <Mono>1</Mono></li>
                  </ul>
                  Save the result as variable <Mono>WeightSample</Mono>.
                </>
              }
            />
            <Step
              n={2}
              title="Find Health Samples — Body Fat %"
              body={
                <>
                  Repeat step 1 with Sample Type{" "}
                  <Mono>Body Fat Percentage</Mono>. Save as{" "}
                  <Mono>BodyFatSample</Mono>. Leave the chain alone if no
                  data — the next step handles missing values.
                </>
              }
            />
            <Step
              n={3}
              title="Get Dictionary from input"
              body={
                <>
                  Build a dictionary with the keys Mycelium expects:
                  <ul className="mt-1 list-disc list-inside text-[13px] text-ink-3">
                    <li>
                      <Mono>weight_kg</Mono> → numeric value of{" "}
                      <Mono>WeightSample</Mono>
                    </li>
                    <li>
                      <Mono>body_fat_percent</Mono> → numeric value of{" "}
                      <Mono>BodyFatSample</Mono> (or empty)
                    </li>
                    <li>
                      <Mono>recorded_at</Mono> → ISO date from{" "}
                      <Mono>WeightSample.End Date</Mono> (format with
                      <Mono> Format Date</Mono>, ISO 8601)
                    </li>
                    <li>
                      <Mono>source</Mono> → text <Mono>apple_health</Mono>
                    </li>
                  </ul>
                </>
              }
            />
            <Step
              n={4}
              title="Get Contents of URL"
              body={
                <>
                  <ul className="list-disc list-inside text-[13px] text-ink-3">
                    <li>URL: <Mono>{url}</Mono></li>
                    <li>Method: <Mono>POST</Mono></li>
                    <li>Headers — <Mono>X-API-Secret</Mono>: the value from the secret panel above</li>
                    <li>Headers — <Mono>Content-Type</Mono>: <Mono>application/json</Mono></li>
                    <li>Request Body: <Mono>JSON</Mono> → the dictionary from step 3</li>
                  </ul>
                </>
              }
            />
            <Step
              n={5}
              title="Show Notification"
              body={
                <>
                  Pull the <Mono>summary</Mono> key from the response and
                  show it as a banner:
                  <ul className="list-disc list-inside text-[13px] text-ink-3 mt-1">
                    <li>Get Dictionary Value · Key: <Mono>summary</Mono></li>
                    <li>
                      Title: <Mono>Mycelium</Mono> · Body: the dictionary
                      value · Sound: Off
                    </li>
                  </ul>
                </>
              }
            />
          </ol>
        </Panel>

        <Panel title="Schedule it">
          <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] leading-relaxed">
            iOS Settings → Shortcuts → Automation → Personal Automation. Pick
            a time (e.g. 07:30 daily) and link this Shortcut. Set{" "}
            <Mono>Ask Before Running</Mono> to <Mono>Off</Mono> so it fires
            silently after your morning weigh-in.
          </p>
        </Panel>

        <Panel title="Manual fallback">
          <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] leading-relaxed">
            No Shortcut yet? Use the form on{" "}
            <Mono>/fitness/body</Mono> — same endpoint under the hood, just
            with <Mono>source=&quot;manual&quot;</Mono>.
          </p>
        </Panel>
      </div>
    </Shell>
  );
}

function Step({
  n,
  title,
  body,
}: {
  n: number;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <li className="flex gap-4">
      <span className="shrink-0 h-7 w-7 rounded-full border border-accent/40 bg-accent/10 text-accent text-sm font-[family-name:var(--font-mono)] flex items-center justify-center">
        {n}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-ink-4 mb-1">{title}</div>
        <div className="text-sm text-ink-3 leading-relaxed">{body}</div>
      </div>
    </li>
  );
}
