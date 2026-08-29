# Receipts — Phase 2 report

Two fixes, one commit each.

| Commit | Fix |
|---|---|
| `292c27f` | 1 — every amount in `ReceiptsClient.tsx` renders through `<Num/>` |
| `82d0960` | 2 — reconciliation rule extracted to `lib/receipts/reconcile.ts`, shared by `parse.ts` and the line route |

`npx next build` exits 0, no warnings. `npx tsc --noEmit` exits 0.

One caveat on the build, recorded because it looks alarming and is not: the
first invocation died during service-worker bundling with

    ✓ (serwist) Bundling the service worker script with the URL '/sw.js' ...
    uncaughtException [TypeError: Cannot read properties of undefined (reading 'length')]

Two subsequent runs from the same tree completed cleanly (`EXIT=0`). It is a
serwist flake against a warm `.next`, not a consequence of either change —
nothing in these commits touches the service worker, and the failure came
before the compile step that would have seen them.

---

## Fix 1 — amounts render through `<Num/>`

### Files

| Path | Change |
|---|---|
| `components/purchases/ReceiptsClient.tsx` | `money()` string formatter replaced by an `<Amount/>` component; monetary line-table cells mask under privacy; `AMOUNT_CLS` removed. |

Nothing else was touched. No new dependency, no API change.

### The formatter that was there

    function money(v: number | null | undefined, currency = "GBP"): string {
      if (v === null || v === undefined) return "—";
      const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : "£";
      return `${symbol}${Number(v).toFixed(2)}`;
    }

A plain string. It rendered £84.31 whether or not finance privacy was on,
which is what the phase 1 report recorded as deviation 4.

### What replaced it

    function symbolFor(currency: string): string {
      return currency === "USD" ? "$" : currency === "EUR" ? "€" : "£";
    }

    /**
     * Every monetary value on this screen goes through <Num/>, so receipts redact
     * with the rest of finance when privacy is on.
     *
     * format="plain" with decimals={2} rather than format="currency": Money's
     * currency branch hardcodes maximumFractionDigits: 0, which would render
     * £84.31 as "£84" and make penny-level reconciliation meaningless. The symbol
     * is rendered alongside, so a masked value still reads "£•••••".
     */
    function Amount({
      value,
      currency = "GBP",
      className = "",
    }: {
      value: number | null | undefined;
      currency?: string;
      className?: string;
    }) {
      if (value === null || value === undefined) {
        return <span className={className}>—</span>;
      }
      return (
        <span className={className}>
          {symbolFor(currency)}
          <Num value={Number(value)} decimals={2} />
        </span>
      );
    }

`format="plain"` rather than `format="currency"` is the one real decision here.
`Num`'s currency branch delegates to `Money`, and `Money`'s `currency` case
(`components/finance/Money.tsx:21`) sets `maximumFractionDigits: 0`. A screen
whose whole purpose is checking that lines sum to a printed total cannot round
£84.31 to £84. The currency symbol is therefore rendered beside a plain 2dp
`Num`, which also keeps `symbolFor()` honest about USD and EUR — `Money` would
have accepted a `currency` prop but discarded the decimals.

### Every monetary value on the screen, and where it now goes

| Value | Location | Renders via |
|---|---|---|
| `receipt.total` (list row) | `ReceiptsClient.tsx:246` | `<Amount/>` → `<Num/>` |
| `receipt.total` (RECEIPT TOTAL) | `:389` | `<Amount/>` → `<Num/>` |
| `receipt.parsed_total` (LINES ADD UP TO) | `:393` | `<Amount/>` → `<Num/>` |
| `delta` (DIFFERENCE) | `:397` | `<Amount/>` → `<Num/>` |
| `line.unit_price` | `:532` | `moneyCell()` → input, or `<Num/>` when hidden |
| `line.vat` | `:537` | `moneyCell()` → input, or `<Num/>` when hidden |
| `line.line_total` | `:540` | `moneyCell()` → input, or `<Num/>` when hidden |

`line.quantity` (`:522`) is deliberately **not** masked. It is a count, not
money, and this masking exists to hide amounts. Masking it would also make the
quantity column uneditable for no privacy benefit.

`receipt.subtotal` and `receipt.vat_total` are columns on the table but are not
rendered by this component at all, so there was nothing to convert.

### The editable-cell problem

The three monetary columns in the line table are `<input>` elements. An input
cannot be masked by wrapping it — its `value` is the amount. Leaving them as
inputs would have meant the reconciliation row above redacting to `£•••••`
while the figures that produce it sat in plain text directly below it.

    /**
     * Monetary cells are editable inputs normally, but render as a masked
     * <Num/> while finance privacy is on — an input whose value is dots cannot
     * be meaningfully edited, and leaving them editable would leak the figures
     * the masking is meant to hide.
     */
    const moneyCell = (
      raw: string,
      setRaw: (v: string) => void,
      stored: number | null,
      commit: (n: number | null) => void,
      opts?: { title?: string },
    ) =>
      financeHidden ? (
        <div className="text-right">
          <Num value={stored ?? 0} decimals={2} />
        </div>
      ) : (
        <input
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onBlur={() => {
            const n = numOrNull(raw);
            if (n !== stored) commit(n);
          }}
          className={cell}
          title={opts?.title}
        />
      );

**Consequence worth stating plainly: line amounts are not editable while
finance privacy is on.** Toggling privacy off (`Cmd/Ctrl+Shift+H`, wired in
`lib/context/PrivacyContext.tsx:31`) restores the inputs. This is a real
behaviour change, not only a visual one, and it is the trade the masking
requires — there is no way to edit a value you are not allowed to see.

### The build-breaker this introduced

Replacing `money()` with `<Amount/>` removed the last three uses of

    /** Amounts use --font-mono, which resolves to Berkeley Mono where installed. */
    const AMOUNT_CLS =
      "font-[family-name:var(--font-mono)] tabular-nums text-loam-4";

leaving it declared and unread. `tsc --noEmit` accepts that; `next build` does
not — ESLint `no-unused-vars` fails the production build, which is the exact
failure mode `AGENTS.md` records for commit `230d686`. The constant was
deleted. No styling is lost: `Num` applies
`font-[family-name:var(--font-jetbrains-mono)] tabular-nums` itself
(`components/ui/Num.tsx:65`).

That is a font change, though, not only a class change. The old amounts used
`--font-mono`, which `app/globals.css:224` resolves to `"Berkeley Mono"` first;
`Num` names JetBrains Mono directly. Receipt amounts now match every other
`Num` on the site rather than matching the rest of the receipts screen. The
remaining `Mono` elements here — dates, item codes, status badges — still use
`--font-mono`.

### Privacy provider

`usePrivacy()` does not throw outside a provider:
`lib/context/PrivacyContext.tsx:22` returns
`{ financeHidden: true, ... }` as a fallback, so the failure mode is "masked",
never "leaked". In practice the provider is mounted at `app/layout.tsx:69`,
above everything, so `/organisation/receipts` is inside it and the toggle works
normally.

---

## Fix 2 — one reconciliation rule, two call sites

### Files

| Path | Change |
|---|---|
| `lib/receipts/reconcile.ts` | New. `money()`, `reconcile()`, `isReconcilable()`; types `ReviewReason`, `Reconciliation`. |
| `lib/receipts/parse.ts` | Local `money()` deleted; inline status block replaced by `reconcile()`; `TOTAL_TOLERANCE` import dropped. |
| `app/api/receipts/[id]/lines/[lineId]/route.ts` | Parent select widened; status re-run after `parsed_total` is recomputed; `status`/`review_reason` added to the response. |

### The whole new module

    import { TOTAL_TOLERANCE, type ReceiptStatus } from "@/lib/types/receipt";

    /** Reasons reconciliation holds a receipt back from 'parsed'. */
    export type ReviewReason = "no_total" | "total_mismatch";

    export type Reconciliation = {
      status: Extract<ReceiptStatus, "parsed" | "needs_review">;
      review_reason: ReviewReason | null;
    };

    /** Rounds to 2dp without floating-point tails (0.1 + 0.2 style). */
    export function money(n: number): number {
      return Math.round(n * 100) / 100;
    }

    /**
     * The one reconciliation rule, shared by the parser and the line editor.
     *
     * A receipt whose lines do not add up to its printed total is not trustworthy
     * enough to file silently. Both call sites must agree not only on the
     * tolerance but on the rounding that feeds it, which is why `money()` lives
     * here too — the same sum rounded two different ways can land on opposite
     * sides of a 0.05 boundary.
     */
    export function reconcile(
      parsedTotal: number,
      total: number | null | undefined,
    ): Reconciliation {
      if (total === null || total === undefined) {
        return { status: "needs_review", review_reason: "no_total" };
      }
      if (Math.abs(parsedTotal - total) > TOTAL_TOLERANCE) {
        return { status: "needs_review", review_reason: "total_mismatch" };
      }
      return { status: "parsed", review_reason: null };
    }

    /**
     * Whether a receipt's status may be recomputed from its lines.
     *
     * Two states are terminal as far as a line edit is concerned:
     *
     * - 'failed' — the parse never produced a trustworthy line set, so the sum of
     *   whatever lines exist says nothing about the receipt. Re-running the rule
     *   on a failed receipt with a null total would silently relabel it
     *   'needs_review' and lose the recorded failure reason.
     * - 'no_total' — there is no printed total to reconcile against, so no edit to
     *   the lines can resolve it. Only a reparse (or an edit to the receipt's own
     *   total) can.
     *
     * The parser does not use this: it computes a status from scratch and is the
     * thing that sets 'failed' in the first place.
     */
    export function isReconcilable(
      status: ReceiptStatus,
      reviewReason: string | null,
    ): boolean {
      return status !== "failed" && reviewReason !== "no_total";
    }

### Why `money()` moved as well

The brief asked for the rule. The rule is a comparison against
`TOTAL_TOLERANCE`, and that comparison is only meaningful if both sides were
rounded identically. Before this change there were two implementations of the
rounding.

`lib/receipts/parse.ts`, a private helper:

    function money(n: number): number {
      return Math.round(n * 100) / 100;
    }

`app/api/receipts/[id]/lines/[lineId]/route.ts`, open-coded inside the sum:

    const parsedTotal =
      Math.round(
        (...).reduce((sum, l) => sum + (Number(l.line_total) || 0), 0) * 100,
      ) / 100;

They agreed. But sharing one rule while leaving two copies of its input
rounding would have re-opened the same drift the extraction exists to close, so
`money()` went into `reconcile.ts` and both sites now import it.

### What `parse.ts` looks like now

Before:

    let status: ParseOutcome["status"] = "parsed";
    let reviewReason: string | null = null;
    if (parsed.total === null) {
      status = "needs_review";
      reviewReason = "no_total";
    } else if (Math.abs(parsedTotal - parsed.total) > TOTAL_TOLERANCE) {
      status = "needs_review";
      reviewReason = "total_mismatch";
    }

After:

    // Reconciliation. Shared with the line-edit route so an edited receipt is
    // judged by exactly the same rule the parse applied.
    const { status, review_reason: reviewReason } = reconcile(parsedTotal, parsed.total);

Behaviour is unchanged — the same rule, relocated. The `failed` paths in
`parseReceipt()` are untouched and still short-circuit before reconciliation is
reached, so `reconcile()` never sees a failed parse.

### What the line route does now

The parent lookup already existed, for ownership. It now carries the three
columns reconciliation needs, in the same round trip:

    // receipt_lines has no user_id of its own, so ownership is checked on the
    // parent receipt before anything is written. The reconciliation columns are
    // selected in the same round trip because the edit below has to re-judge
    // the receipt against its printed total.
    const { data: parent } = await supabase
      .from("receipts")
      .select("id, total, status, review_reason")
      .eq("id", id)
      .eq("user_id", uid)
      .maybeSingle<{
        id: string;
        total: number | null;
        status: ReceiptStatus;
        review_reason: string | null;
      }>();

and after the sum is recomputed:

    // A new parsed_total means the old status is a stale judgement, so the
    // parser's own rule is re-run over the edited figures — an edit that brings
    // the lines back within tolerance clears 'total_mismatch' by itself, and one
    // that breaks them raises it. 'failed' and 'no_total' are left alone: see
    // isReconcilable().
    const update: Record<string, unknown> = {
      parsed_total: parsedTotal,
      updated_at: new Date().toISOString(),
    };
    let status: ReceiptStatus = parent.status;
    let reviewReason: string | null = parent.review_reason;

    if (isReconcilable(parent.status, parent.review_reason)) {
      const outcome = reconcile(
        parsedTotal,
        parent.total === null ? null : Number(parent.total),
      );
      status = outcome.status;
      reviewReason = outcome.review_reason;
      update.status = status;
      update.review_reason = reviewReason;
    }

    await supabase.from("receipts").update(update).eq("id", id);

`parsed_total` is written unconditionally, including for `failed` and
`no_total` receipts. Only `status` and `review_reason` are withheld. A failed
receipt whose lines you edit still gets an accurate sum in the reconciliation
row; it just does not get relabelled.

`Number(parent.total)` rather than `parent.total` directly: the column is
`numeric`, and the existing line-sum code in this same route already coerces
(`Number(l.line_total) || 0`) rather than trusting the driver's JSON type. The
coercion sits behind an explicit null check, so `Number(null) === 0` cannot
turn a missing total into a real one.

### Status transitions, exhaustively

`Δ` is `|parsed_total − total|` after the edit.

| Status before | `review_reason` before | `total` | Status after | `review_reason` after |
|---|---|---|---|---|
| `failed` | any | any | `failed` (unchanged) | unchanged |
| any | `no_total` | any | unchanged | `no_total` (unchanged) |
| `parsed` | `null` | set, Δ ≤ 0.05 | `parsed` | `null` |
| `parsed` | `null` | set, Δ > 0.05 | `needs_review` | `total_mismatch` |
| `needs_review` | `total_mismatch` | set, Δ ≤ 0.05 | `parsed` | `null` |
| `needs_review` | `total_mismatch` | set, Δ > 0.05 | `needs_review` | `total_mismatch` |
| `uploaded` / `parsing` | `null` | set, Δ ≤ 0.05 | `parsed` | `null` |
| `uploaded` / `parsing` | `null` | set, Δ > 0.05 | `needs_review` | `total_mismatch` |
| `uploaded` / `parsing` / `parsed` | `null` | `null` | `needs_review` | `no_total` |

The last row is the one to read twice. **The guard prevents leaving `no_total`,
not entering it.** A receipt with no printed total that gets a line edit is
moved to `needs_review`/`no_total` — that is the rule correctly reporting that
this receipt cannot be reconciled, not an override of a protected state. Once
there, no further line edit moves it. Only a reparse, or a `PATCH` to the
receipt's own `total`, can.

### Response shape

The route's JSON gained two fields:

    {
      "line": { ... },
      "parsed_total": 84.31,
      "status": "parsed",
      "review_reason": null
    }

`ReceiptsClient.patchLine()` (`:293`) does not read them — it calls `mutate()`
and refetches, so the status badge and the reconciliation row update from the
refetch either way. The fields are there so a `curl` caller sees the same
outcome the UI does, without a second request.

---

## Notes and open items

1. **`<Num/>` is not what Spending actually uses.** The brief asked for `<Num>`
   "consistently with Spending", and `<Num>` is what was used. For the record,
   Spending renders money through `<Money/>` directly, not through `Num` —
   `format="amount"` at `components/finance/SpendingClient.tsx:465`, `:942`,
   `:1123`, and `format="balance"` at `:562`, `:947`.

   The visible difference is the redaction glyph. Spending's balances mask to
   `£•••.••` and its signed amounts to `•£•••.••`; receipts now mask to
   `£•••••` — `Num`'s plain placeholder, with the symbol rendered outside it.
   Both hide the number and both hold their width, so the privacy behaviour is
   consistent; the dot pattern is not identical. Making them identical would
   mean `<Money format="balance"/>` instead, which is a different call from the
   one specified — flagging it rather than making it. The redacted text colour
   differs too: `Num` uses `text-text-lo`, `Money` uses `text-ink-3`.

2. **No guard against editing during `parsing`.** `parseReceipt()` sets
   `status = 'parsing'`, then deletes and re-inserts all lines. A `PATCH`
   landing inside that window can write a status the parse then overwrites, or
   sum a half-inserted line set. `isReconcilable()` deliberately does not
   exclude `parsing`, because the brief named `failed` and `no_total` and
   nothing else. The window is short and the reparse is authoritative when it
   finishes, so the practical risk is a status that is briefly wrong. Adding
   `parsing` to the guard is a one-line change if you want it.

3. **No migration.** Both fixes are code-only. `receipts.status` and
   `receipts.review_reason` already exist from `0092_receipts.sql`, and no new
   value is written to either — `parsed`, `needs_review`, `no_total` and
   `total_mismatch` were all already produced by `parse.ts`.

4. **Phase 1's migration is still unapplied**, unless it has been pushed since
   that report. Both routes touched here return 500 until `supabase db push`
   runs. Nothing in these two commits changes that, and neither was exercised
   against a live table.

5. **Not tested at runtime.** There are no tests under `lib/receipts/`, and the
   transition table above is read from the code, not observed. It describes
   `reconcile()` and `isReconcilable()` as written. If you want it locked down,
   `reconcile()` is now a pure function with no Supabase dependency and is
   trivially unit-testable — a side benefit of the extraction.
   `lib/finance/paypal-api.test.ts` shows the existing pattern.
