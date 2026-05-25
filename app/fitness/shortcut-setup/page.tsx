import { Panel } from "@/components/dashboard/Panel";
import { Mono } from "@/components/dashboard/Mono";
import { SecretCopy } from "@/components/fitness/SecretCopy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ShortcutSetupPage() {
  // Reads from server-side env — never embedded in client JS unless the user
  // clicks the copy button, which sets the value in clipboard from a tiny
  // string passed to a client component.
  const secret = process.env.API_SECRET ?? "(API_SECRET env var missing)";
  const url = process.env.SHORTCUT_AUDIO_URL ?? "https://mycelium.sporebit.com/api/capture-audio";

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <h1 className="text-2xl italic font-[family-name:var(--font-display)] text-ink-4">
        iOS Shortcut setup
      </h1>
      <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] leading-relaxed">
        One-tap voice capture from your iPhone&apos;s Action Button or Lock Screen.
        Open the Shortcuts app on iOS, create a new shortcut, and add the four
        actions below in order.
      </p>

      <Panel title="Your API secret" topRight={<Mono>copy me</Mono>}>
        <SecretCopy value={secret} label="X-API-Secret" />
        <p className="text-[11px] text-ink-3 mt-2 italic font-[family-name:var(--font-display)]">
          This header authenticates the Shortcut. Don&apos;t paste it anywhere
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
            title="Record Audio"
            body={
              <>
                Add the <Mono>Record Audio</Mono> action. Settings:
                <ul className="mt-1 list-disc list-inside text-[13px] text-ink-3">
                  <li>Audio Quality: <span className="text-ink-4">Normal</span></li>
                  <li>Start Recording: <span className="text-ink-4">Immediately</span></li>
                  <li>Stop Recording: <span className="text-ink-4">On Tap</span></li>
                </ul>
              </>
            }
          />
          <Step
            n={2}
            title="Get Contents of URL"
            body={
              <>
                <ul className="list-disc list-inside text-[13px] text-ink-3">
                  <li>URL: <Mono>{url}</Mono></li>
                  <li>Method: <Mono>POST</Mono></li>
                  <li>
                    Headers — add <Mono>X-API-Secret</Mono> with the value from
                    the &quot;Your API secret&quot; panel above
                  </li>
                  <li>Request Body: <Mono>Form</Mono></li>
                  <li>
                    Form fields:
                    <ul className="ml-5 list-disc list-inside">
                      <li>
                        <Mono>audio</Mono> — set type to <Mono>File</Mono>, value
                        = the recording from step 1
                      </li>
                      <li>
                        <Mono>source</Mono> — type <Mono>Text</Mono>, value{" "}
                        <Mono>ios_shortcut</Mono>
                      </li>
                    </ul>
                  </li>
                </ul>
              </>
            }
          />
          <Step
            n={3}
            title="Get Dictionary Value"
            body={
              <>
                Pull the <Mono>summary</Mono> field from the response.
                <ul className="list-disc list-inside text-[13px] text-ink-3 mt-1">
                  <li>Get: <Mono>Value for Key</Mono></li>
                  <li>Key: <Mono>summary</Mono></li>
                  <li>From: the output of step 2 (Contents of URL)</li>
                </ul>
              </>
            }
          />
          <Step
            n={4}
            title="Show Notification"
            body={
              <>
                <ul className="list-disc list-inside text-[13px] text-ink-3">
                  <li>Title: <Mono>Mycelium</Mono></li>
                  <li>
                    Body: the Dictionary Value from step 3 (Mycelium&apos;s
                    rendered summary, e.g. &quot;💪 Logged to Mon PM Legs…&quot;)
                  </li>
                  <li>Sound: Off</li>
                </ul>
              </>
            }
          />
        </ol>
      </Panel>

      <Panel title="Triggers">
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] mb-2">
          In iOS Settings → Action Button (or Lock Screen widgets) point the
          trigger at this Shortcut. The same Shortcut works from:
        </p>
        <ul className="list-disc list-inside text-sm text-ink-4">
          <li>Action Button (single press)</li>
          <li>Lock Screen widget</li>
          <li>Home Screen widget</li>
          <li>Back Tap (Settings → Accessibility → Touch → Back Tap)</li>
        </ul>
      </Panel>

      <Panel title="What gets captured">
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] leading-relaxed">
          Audio is transcribed via Whisper. The transcription is classified
          into one of: <Mono>task</Mono>, <Mono>note</Mono>, <Mono>decision</Mono>,{" "}
          <Mono>journal</Mono>, <Mono>capture</Mono>, <Mono>workout</Mono>. For
          workouts, a second LLM pass extracts structured sets, exercises,
          cardio entries and pain logs — then routes them into the right
          session (active, planned, or new extra).
        </p>
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] leading-relaxed mt-2">
          If the workout is ambiguous (e.g. you have both a planned and an
          in-progress session), the Telegram bot will ping you with buttons to
          pick one. Type <Mono>/pending</Mono> in Telegram any time to see
          unresolved routes.
        </p>
      </Panel>

      <Panel title="Reference JSON">
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] mb-2">
          A machine-readable copy of these steps lives at{" "}
          <Mono>/shortcuts/mycelium-capture.shortcut.json</Mono>.
        </p>
      </Panel>
    </div>
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
