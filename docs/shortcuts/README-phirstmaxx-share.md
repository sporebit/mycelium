# Send to PhirstMaxx — the iPhone share-sheet Shortcut

The source is `phirstmaxx-share.cherri` in this folder, written in [Cherri](https://cherrilang.org) (claude/phirstmaxx-spec.md §5, iPhone row). It is handed over as source: the compile, the signing and the import link are steps only a Mac (or a browser on the Cherri Playground) can do, and none of them can be done from the Windows PC this was written on.

What the Shortcut does (spec §2.1):

1. Replays anything still waiting in `iCloud Drive/Shortcuts/Mycelium Inbox/` (one `<client_id>.json` per drop, plus `<client_id>.jpg` when a picture was shared), deleting each file the server acknowledges.
2. Reads what was shared — a URL, text, a Safari page or an image — and builds `{ client_id, source: "shortcut", url, text, title }`. The client id is made once per run and reused on every retry, so the server sees one drop however many times the phone sends it.
3. Saves that payload to the inbox folder **before** sending, so a dead network never loses a drop.
4. `POST https://<host>/api/phirstmaxx/drops` with `Authorization: Bearer <token>`; JSON, or multipart with the picture under `file`.
5. On an answer carrying an `id`: deletes the queued files and shows "Saved — researching". Otherwise: "Kept on the phone; will send next time".

No host and no token are in the source. Both are Import Questions answered once when the Shortcut is installed.

## 1. Mint the token in Mycelium

Settings → Security → API tokens → New token. Name it "iPhone share sheet", verbs **write**, routes **PhirstMaxx drops** (`phirstmaxx_drops` in `lib/system/apiTokens.ts`, which covers `/api/phirstmaxx/drops` and nothing else). Copy the `mtk_…` value: it is shown once. Do not paste it anywhere but the Shortcut's import question.

Mycelium only reads tokens from the `Authorization: Bearer` header (middleware.ts step 3b). The spec sketch said `x-api-token`; the Shortcut sends the header the server actually checks.

## 2. Compile and sign (Mac)

```
brew tap electrikmilk/cherri
brew install electrikmilk/cherri/cherri
cd <repo>/docs/shortcuts
cherri phirstmaxx-share.cherri
```

No output means success and `Send to PhirstMaxx.shortcut` is next to the source, signed (macOS signs natively). `cherri phirstmaxx-share.cherri --open` imports it straight into Shortcuts on the Mac. `--debug` prints the compiler's stack and leaves a `.plist` beside the file if something is refused.

Where the compiler is unhappy with an action name, the source says so in a comment at that line: the Cherri docs were read from Windows and a handful of names (the `#define inputs` type words, `typeOf` result strings, `getFile` on a folder) could not be checked against the compiler. Fix the name, recompile.

No Mac to hand: the Cherri Playground at https://playground.cherrilang.org runs in any browser and signs what it builds; paste the source there. On Linux, `cherri phirstmaxx-share.cherri --hubsign` signs through RoutineHub's service. There is no iOS Cherri app and no Windows build (the install page says Windows "needs work").

## 3. Install on the iPhone and answer the two questions

Put the `.shortcut` file in iCloud Drive and tap it in Files on the phone (or AirDrop it). Shortcuts asks the two Import Questions:

- **Your Mycelium host** — the bare host, no `https://`, e.g. `mycelium.example.com`.
- **Your Mycelium API token** — the `mtk_…` value from step 1.

Both are stored inside the Shortcut on the phone, nowhere else.

## 4. Share link (optional)

To hand the installed Shortcut to another phone: Shortcuts → long-press "Send to PhirstMaxx" → Share → Copy iCloud Link. The link carries the Shortcut with the questions **answered**, token included: share it only with someone who should hold that token (Kirsty, after her invite, should mint her own). To share without the token, share the `.shortcut` file instead; the questions are asked again on import.

## 5. Test

1. In Safari on the phone, open any YouTube video. Share → **Send to PhirstMaxx**.
2. Within a second or two a notification says **"Saved — researching"**.
3. In Mycelium → PhirstMaxx the drop is there with the video's URL; research fills the card in the next minutes (spec §6).
4. Share the same video again: still "Saved — researching", still one card (the server treats a repeated client id as the same drop; a fresh run has a fresh id, so this one is a second drop of the same link, which research folds into the same thing: spec §12 "the same link twice → one thing").
5. Offline test: Airplane Mode, share a link. Shortcuts stops with a network error — the payload is already in `iCloud Drive/Shortcuts/Mycelium Inbox/`. Airplane Mode off, share anything else: the waiting file is sent first and disappears.
6. Share a photo from Photos: the picture arrives under `file`; the card shows it once research has resolved the place.

Expected server answer on success: HTTP 202 with a JSON body carrying the drop's `id`. The Shortcut keys success off that `id` field; if the drops route answers differently, change the `@replyId = @reply['id']` lines.

## 6. What could not be done from Windows

- Compile, sign, import, or test the Shortcut. The source is complete; the compiler is the arbiter of a few action names (marked in comments).
- Check the exact `typeOf()` strings Shortcuts returns for a Safari page or an image; the source guards each branch so a wrong string degrades to "send as text/URL" rather than failing.
- Pick a glyph: the `#define glyph` line is commented out; choose one at https://glyphs.cherrilang.org and uncomment.

## 7. Failure behaviour, in one place

| Situation | What happens |
|---|---|
| Network down | Payload already saved to the inbox; Shortcuts shows its own error; next run sends it first |
| Server 4xx/5xx | Body has no `id` → files stay, "Kept on the phone; will send next time" |
| Token revoked | Same as above, every run, until a new token is entered (re-import the `.shortcut`) |
| Same drop sent twice | One drop: same `client_id` |
| Image shared | Multipart, picture under `file`; queued as `<client_id>.jpg` beside the JSON for replay |
