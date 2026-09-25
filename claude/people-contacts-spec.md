# People contacts — vCard import, merge, delete, export (Phil, 2026-09-25)

_The "project version" of this spec was not found on this machine or in the repo; this file is the brief as given, committed with MYC-165. The As-built section at the end records the migration number, deviations and the survey._

## Start
1. git pull. Make sure no other branch owns supabase/migrations/** and the Tasks merge is on main. Take the next free migration number (check both the local chain and `supabase migration list`).
2. `tix new "People: vCard import, merge, delete, export" --project MYC`. Reference that key in every commit.
3. Add imports/private/ to .gitignore BEFORE touching the file. Confirm with `git check-ignore imports/private/contacts.vcf`. Never commit, log, echo or paste any contact data into a report, commit message, ticket comment or doc. Report counts only.
4. Survey first and put it in the report: the people table's columns, every FK to people.id (from pg_constraint), every reader of people/people_aliases (grep .from('people'), the alias resolver, lib/daylog, lib/quotes, people_daylog_stats). Then parse the file and report only counts: number of cards, vCard version(s), cards with phones/emails/photos, and any unparseable cards.

## Decisions (locked)
- **C1** Contact tier: people.tier ('person'|'contact'). Imported contacts get 'contact' and are excluded from every matching path (daylog engine and interviewer cards, quotes speaker/alias matching, the alias resolver, people_daylog_stats). They're visible behind a Contacts chip. Promote with one tap, and automatically on the first link from anywhere; a DB trigger on the linking tables is the reliable way, so check it covers every FK found in the survey.
- **C2** No automatic merges. Same E.164 phone, same lower-cased email, or a name trigram ≥ 0.6 (the lib/quotes/text.ts function) → people_import_candidates with Merge into X / Keep separate / Skip. Non-matching cards import straight in as contacts. Import runs as a batch (people_import_batches) and is idempotent: re-running with the same file must not duplicate anyone (match on vCard UID first).
- **C3** Merge from anywhere in People: pick a survivor, choose per field. Phones, emails, aliases and vCard extras are unioned and de-duplicated. A SECURITY DEFINER function re-points every FK to people.id found through pg_constraint at run time (not a hard-coded list), in one transaction, and de-duplicates unique-key collisions. The loser gets deleted_at and merged_into_id, and any route given the old id resolves to the survivor. Write an audit_events row.
- **C4** Soft delete: deleted_at; hidden everywhere (every people reader filters it); a Settings → People bin with Restore; a nightly cron hard-deletes after 30 days (add it to the existing nightly cron, bearer CRON_SECRET). The confirm dialog lists linked counts and offers Merge instead.
- **C5** person_phones and person_emails: number_e164, number_raw, free-text editable label, is_current, include_in_export (defaults to false when marked old; Phil can re-enable per number), sort_order. Move any existing phone/email columns on people into them, with a count assertion in the migration.
- **C6** person_vcards keeps the raw card and its UID. On export, fields Mycelium doesn't model are carried through from the raw card, and modelled fields overwrite theirs.
- **C7** GET /api/people/export.vcf (authenticated, never public): vCard 3.0 for iPhone/iCloud, UTF-8, CRLF, 75-octet folding, UID kept, only include_in_export numbers and emails, custom labels via itemN.TEL + itemN.X-ABLabel, ?tier=person|contact|all (default all), deleted people excluded.
- New tables: P12 adoption helper, RLS per the invariant (enable + restrictive deny-all + service_role grant, then space policies), registered with People's entity group in lib/access/registry.ts. The isolation test must cover them.

## Libraries
- A maintained vCard parser that handles 2.1/3.0/4.0, quoted-printable, folding and PHOTO. libphonenumber-js with default region GB. Check what's already in package.json before adding anything.

## UI
- People list: Contacts / People chip, Promote, multi-select → Merge.
- Person page: Numbers and Emails editors (inline label edit, current/old, export toggle, add/remove/reorder), Merge…, Delete.
- /organisation/people/import: upload, the batch summary, the review list with side-by-side cards.
- Settings → People bin. An Export .vcf button on People.

## Tests
- Unit: the parser round-trip (import → export → re-import gives the same cards, UIDs kept), phone normalisation, the label/X-ABLabel writer, line folding, the merge FK walk against a test schema with a unique-collision case, soft-delete filtering, promote-on-link.
- npm test and npm run isolation-test must pass. Replay the migration on the local stack first, then supabase db push.
- Build gate before every push: rm -rf .next && npx next build. Push to main and smoke-test on production with a 3-card synthetic .vcf only, never the real file. Delete the synthetic people afterwards.

## Then the real import
- Run the import of imports/private/contacts.vcf against production as Phil. Report counts only: imported as contacts, sent to review, skipped, failed. Leave the review list for Phil.

## Finish
- Two repo templates, instantiated as tickets: (a) smoke-test-people-contacts (kind = test); (b) guide-contacts-to-iphone (kind = guide, house style) — export the current contacts from icloud.com/contacts as a backup vCard; download the Mycelium export; delete all contacts on icloud.com; import the Mycelium .vcf on icloud.com; check the count and five named people on the iPhone. Include a "why" line explaining that iCloud adds on import and doesn't merge.
- Update this file (migration number, deviations, the survey's FK list), claude/spec-organisation.md (People section) and claude/spec-index.md.
- Report with `tix comment <key>`: commits, migration, counts, deviations. No code and no contact data. Move to Done with deploy evidence; leave Closed for Phil.

## As built
_(filled in by the build)_
