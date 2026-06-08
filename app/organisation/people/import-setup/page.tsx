import { Panel } from "@/components/dashboard/Panel";
import { Mono } from "@/components/dashboard/Mono";
import { SecretCopy } from "@/components/fitness/SecretCopy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function PeopleImportSetupPage() {
  const secret = process.env.API_SECRET ?? "(API_SECRET env var missing)";
  const url =
    process.env.SHORTCUT_PEOPLE_IMPORT_URL ??
    "https://mycelium.sporebit.com/api/people/import";

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <h1 className="text-2xl italic font-[family-name:var(--font-display)] text-ink-4">
        Bulk-import contacts from iPhone
      </h1>
      <p className="text-sm text-text-1 leading-relaxed">
        A one-tap iOS Shortcut that exports your Contacts to Mycelium&apos;s
        Rolodex. Existing rows are merged (we only fill blanks); new rows are
        created with first / first-last / last aliases.
      </p>

      <Panel borderless title="Your API secret" topRight={<Mono>copy me</Mono>}>
        <SecretCopy value={secret} label="X-API-Secret" />
        <p className="text-[11px] text-text-2 mt-2 italic font-[family-name:var(--font-display)]">
          Don&apos;t paste it anywhere public.
        </p>
      </Panel>

      <Panel borderless title="Endpoint" topRight={<Mono>POST</Mono>}>
        <SecretCopy value={url} label="URL" />
      </Panel>

      <Panel borderless title="Shortcut steps">
        <ol className="flex flex-col gap-4">
          <Step n={1} title="Find Contacts">
            Add the <Mono>Find Contacts</Mono> action. Filter to contacts that
            have a phone or email if you want to skip empties.
          </Step>
          <Step n={2} title="Repeat with Each → Build Dictionary">
            For each contact, create a Dictionary with these keys:
            <ul className="mt-1 list-disc list-inside text-[13px] text-text-1">
              <li><Mono>first_name</Mono> ← <Mono>Contact.First Name</Mono></li>
              <li><Mono>last_name</Mono> ← <Mono>Contact.Last Name</Mono></li>
              <li><Mono>phone</Mono> ← <Mono>Contact.Phone</Mono></li>
              <li><Mono>email</Mono> ← <Mono>Contact.Email</Mono></li>
              <li><Mono>birthday</Mono> ← <Mono>Contact.Birthday</Mono> (formatted YYYY-MM-DD)</li>
            </ul>
            Add each dictionary to a list variable.
          </Step>
          <Step n={3} title="Wrap into JSON">
            Outside the loop, build:
            <pre className="mt-1 text-[12px] text-text-1 bg-ink-2 rounded-sm p-3 overflow-x-auto">{`{ "people": <the list from step 2> }`}</pre>
          </Step>
          <Step n={4} title="POST to Mycelium">
            <ul className="list-disc list-inside text-[13px] text-text-1">
              <li>URL: <Mono>{url}</Mono></li>
              <li>Method: <Mono>POST</Mono></li>
              <li>
                Header: <Mono>X-API-Secret</Mono> = the secret above
              </li>
              <li>Request Body: <Mono>JSON</Mono></li>
              <li>Body: the JSON from step 3</li>
            </ul>
          </Step>
          <Step n={5} title="Show Notification">
            Show <Mono>created · updated · skipped</Mono> counts from the
            response. Title: <Mono>Mycelium import</Mono>.
          </Step>
        </ol>
      </Panel>

      <Panel borderless title="Schema">
        <pre className="text-[12px] text-text-1 bg-ink-2 rounded-sm p-3 overflow-x-auto whitespace-pre">{`POST /api/people/import
{
  "people": [
    {
      "first_name": "Luke",         // required
      "last_name":  "Henderson",
      "phone":      "+44 7700 900000",
      "email":      "luke@example.com",
      "birthday":   "1990-05-15",
      "address":    "...",
      "relationship": "Friend"
    },
    ...
  ]
}

Response: { "created": N, "updated": M, "skipped": K, "errors": [...] }`}</pre>
      </Panel>
    </div>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-4">
      <span className="shrink-0 h-7 w-7 rounded-full border border-glow-2/50 bg-glow-3/40 text-glow-1 text-sm font-[family-name:var(--font-mono)] flex items-center justify-center">
        {n}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-text-0 mb-1">{title}</div>
        <div className="text-sm text-text-1 leading-relaxed">{children}</div>
      </div>
    </li>
  );
}
