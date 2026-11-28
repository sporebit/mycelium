# Dossier: E.keys, Keys, secrets and domains (SEC)

*Written 2026-11-28 by a dossier agent in the unattended run. Every product fact below was looked up on 2026-11-28; anything that could not be confirmed is marked UNVERIFIED. **No key, password or token was opened, read, rotated, revoked, reset or deleted. No credential file, `.env` file or the census files were opened.** Keys are named by role and by where they live, never by value.*

## 1. What Phil decided

One "rotate everything" Field guide, names only, holds every rotation as a phase: the Mycelium rotations already queued (MYC-196, then MYC-6, with MYC-209 listing every caller of the master secret), the old VPS set exposed in May (the calendar agent's Anthropic key, four IONOS mailbox passwords, the API bearer token, the Google OAuth client secret), DropShipAuto's ngrok and GitHub tokens, the old PhirstMaxxing app's push keys, cron secret and service-role key, and the Stripe test key seen in an August screenshot (project unknown). It is not at the front of the queue. The census files on the PC (a live Gmail app password, a Hotmail mailbox export in a Thunderbird folder, unencrypted Proton Pass CSV exports) are the largest known exposure: Claude Code checks and reports; revoke and delete happen only on Phil's say. The first "Mycelium" on the IONOS VPS is checked for what it does now (assumed answer: export its data, then switch it off, nothing switched off without Phil's word); port 3000 on it is found and closed (assumed). Domains: philwhelan.com, sporebit.com and philipwhelan.com (until its quiet year ends) are kept; every other domain goes on a keep-or-drop list (sporebit.store and sporebit.org already "cancel, do not renew"); the standing rule is that **no domain lapses while any address on it is a login or recovery address**. Hardening covers every domain, account-level steps first (they cover every domain at once) and per-domain DNS work after the keep-or-drop sitting (`[claude]` flag, H2.2, not reopened). A "better home than IONOS?" research ticket compares registrars; mail stays at IONOS. The eBay sign-in alerts were all Phil: no incident ticket.

## 2. His kit and constraints

- **Mycelium (production):** Vercel Hobby and hosted Supabase. Secrets live in **Vercel, Mycelium project, Settings, Environment Variables** and in **`.env.local` on the PC** (`A:\Projects\Mycelium`). By name, the code reads, among others: the master secret (`API_SECRET`), the cron secret (`CRON_SECRET`), the Supabase service-role key and JWT secret, the Anthropic and OpenAI API keys, the Telegram bot tokens and webhook secret, the Google OAuth client secret, the Google service-account key, the Google Maps and OpenRouteService keys, the Resend key, a GitHub token, the ElevenLabs key, the web-push (VAPID) private key, and the USDA, YouTube and OpenWeather keys. The full rotation is MYC-6; the two exposed secrets are MYC-196 (the master secret and the Google service-account key, guide at `docs/checklists/rotate-secrets.json`); MYC-209 lists every caller of the master secret.
- **The old IONOS VPS:** May 2026, Postgres and FastAPI behind an API subdomain of the main domain, an agent reading four IONOS inboxes hourly and writing to Google Calendar, a review queue, a watch list, a renewals table; stopped mid-build 17 May. Port 3000 open to the internet, listener unknown. H6: the VPS itself stays up for DropShipAuto (its pm2 and Caddy tickets are DSA-16 and POLY-6, both open).
- **DropShipAuto:** ngrok authtoken and a GitHub token seen in chats.
- **Old PhirstMaxxing app:** web-push keys, a cron secret, a Supabase service-role key. `phm.01` asks whether its old database still exists; `phm.02` shuts the old site.
- **Stripe:** a test-mode secret key in an August screenshot; project unknown. POLY-36 ("Persist Stripe subscription state in the billing routes") shows a POLY project with Stripe code, a first place to look.
- **Domains and mail:** IONOS is registrar and mail host (IONOS Mail Basic). Old sites were on Wix, Squarespace, Shopify and Web Genie.
- **Passwords vault:** Proton Pass.

## 3. What the research found

### 3.1 IONOS account and domain hardening (for `keys.12` and `keys.13`)

- **Account 2FA (free):** IONOS customer account, Menu, My account, **Login & account security**, Configure two-factor authentication, set up with an authenticator app (or the IONOS mobile app; both can run together). At the end IONOS shows a **16-digit recovery code**: store it in Proton Pass, never in a ticket [1][2].
- **Transfer lock:** generic domains (.com, .net, .org) are **locked by default**; the switch is under Domains, **Renewal & Transfer**, per domain; if unlocked for a transfer that does not go ahead, IONOS advises locking it again [3]. Country domains (.co.uk and similar) may differ (UNVERIFIED).
- **DNSSEC is not free at IONOS:** the DNSSEC help article requires **Domain Guard or DNS Pro** on the contract, a DNSSEC-capable extension, IONOS's default name servers and secondary DNS off [4][5]. **Domain Guard** (2FA for changes, DNSSEC, a domain ownership document) costs **£1 the first year, then £15 a year, excluding VAT**, and applies to all new and existing domains in the contract; **DNS Pro** includes DNSSEC at **£1 a month for six months, then £2.50 a month, excluding VAT** [6]. Turning DNSSEC off takes at least 8 hours to propagate [4]. Recommendation for `keys.13`: price it, and turn it on only for the domains kept, after `keys.11`.
- **WHOIS privacy:** UNVERIFIED in this run whether IONOS includes it free for each extension; `keys.12` checks per domain and notes any cost. For .uk domains, Nominet hides a private individual's address by default (general knowledge, UNVERIFIED).
- **Auto-renew with a valid card:** set per contract in the IONOS account (general, not separately sourced). The standing rule decides which domains stay on auto-renew.

### 3.2 Listing dangling DNS records (for `keys.13`)

- A dangling record is a DNS entry (usually a CNAME or an A record) that still points at a service no longer serving that site. Method: list every record in each zone (IONOS DNS page, or an export), then for each CNAME follow the chain to the end; **if the final target does not exist (NXDOMAIN) it is dangling** [7][8]. For A records, check the address still belongs to a service Phil uses.
- Fingerprints: Shopify shows "Sorry, this shop is currently unavailable"; Wix shows "Error ConnectYourDomain occurred"; the community list says **Squarespace requires domain verification and is generally not takeable** [9]. Web Genie: no fingerprint found (UNVERIFIED).
- Tools: the community "can-i-take-over-xyz" list [9]; Nuclei's takeover templates [8]; plain DNS look-ups from the PC are enough for a handful of domains. These are run only against Phil's own domains.
- Null SPF and reject DMARC on non-sending domains belong to `mail.11` (MAIL), not here.

### 3.3 Rotation steps by key (names only, for `keys.01` to `keys.05`)

- **Stripe test key** [10][11]: Dashboard, **API keys** page (sandbox or test mode selected), the key's menu, **Rotate key**, choose the expiry (**Now** deletes the old key at once; a later time keeps both working for up to 7 days), Rotate API key, then store the new value where the integration reads it. Test-mode keys can always be revealed in the dashboard. Check the key's request logs (View request logs) first to see whether anything still uses it. If no project uses Stripe at all, **Expire key** is enough.
- **Anthropic API key (old VPS calendar agent):** Anthropic Console, API keys: disable or delete the named key, create a new one only if the agent is kept (general, not separately sourced; UNVERIFIED wording of the console).
- **Google OAuth client secret (old VPS):** Google Cloud console, APIs & Services, Credentials, the OAuth client: add a new secret, move the app, then disable and delete the old secret (general; UNVERIFIED wording).
- **IONOS mailbox passwords (four):** IONOS, Email, the mailbox, change password. **Every mail client using that mailbox stops until updated** (phones, Thunderbird, the old agent, Mycelium's mail import if it uses one): this is the Kirsty-facing and Phil-facing breakage risk; do it per mailbox with the clients list to hand.
- **API bearer token (old VPS):** lives in the VPS app's own configuration; if the VPS app is switched off after `keys.08`, the token dies with it; otherwise change it in the VPS environment and every caller.
- **ngrok authtoken (DropShipAuto):** ngrok dashboard, Your Authtoken, reset; then the agent's configuration on the machine that runs the tunnel (general; UNVERIFIED wording).
- **GitHub token (DropShipAuto):** GitHub, Settings, Developer settings, Personal access tokens: revoke the named token, create a fine-grained one with only the needed repository, store it where DropShipAuto reads it.
- **Old PhirstMaxxing keys:** if `phm.01` confirms the old Supabase project is deleted, the service-role key is already dead (confirm in the Supabase dashboard that the project is gone); the cron secret and web-push keys live in the old site's hosting environment and die when `phm.02` shuts the site. If either still exists, rotate in the Supabase dashboard (project, Settings, API keys) and the old host's environment variables before shutting.
- **Mycelium:** MYC-196 and MYC-6 carry their own steps; the parent guide only points at them and checks the order (MYC-196 after the new iPhone Shortcuts; MYC-209 before any master-secret change).

### 3.4 The census files (for `keys.06`)

- A check-and-report only: Claude Code lists whether the named files still exist (by name, path, size and date), **never opening, printing or copying their contents**, and checks whether a Gmail app password is still listed on the Google account's app-passwords page only if Phil opens it himself. Revoking the Gmail app password is done at Google Account, Security, App passwords (general; the page exists only while 2-Step Verification is on). Deleting the exports and emptying the folder is `keys.07`, on Phil's word.

## 4. Risks

| Risk | Mitigation carried by the tickets |
|---|---|
| **Lock-out from IONOS** (2FA set up, phone lost, no recovery code) | `keys.12` stores the 16-digit recovery code in Proton Pass in the same step, and tests one sign-in before closing. |
| **Mail outage** when the four IONOS mailbox passwords change | `keys.02` does one mailbox per step with the clients list; Kirsty is not on these mailboxes (UNVERIFIED; the step asks). |
| **A domain lapsing that is still a login or recovery address** | `keys.10` and `keys.11` carry the standing rule on every row; nothing is cancelled in this run. |
| **Breaking a live service** by rotating a key something still uses | Every child guide checks the callers first (MYC-209 for the master secret; Stripe request logs; the VPS check in `keys.08`). |
| **Exposure from the census files** | `keys.06` reports only; `keys.07` acts on Phil's word. |
| **Money** (Domain Guard or DNS Pro for DNSSEC) | `keys.13` says "to be priced"; nothing bought. |
| **DNSSEC misconfiguration** taking a domain offline | Only on IONOS default name servers, only on kept domains, one domain first, checked with an outside validator before the next. |

## 5. Facts that differ from the plan

- **keys.12 / keys.13:** DNSSEC at IONOS requires the paid Domain Guard (£1 then £15 a year, excl. VAT) or DNS Pro (£2.50 a month after six months, excl. VAT) [4][5][6]. The plan treats it as a free setting. `keys.13` carries a Cost section and does DNSSEC only on kept domains after Phil approves the cost.
- **mail.11** in the plan is `after keys.05` (the Stripe key). Its own note says "after the keep-or-drop sitting", which is `keys.11`. Likely a typo for `keys.11`.
- **keys.06** in the plan says it "goes in the Unblock queue (unblock.12)"; the Unblock epic's row for it is **unblock.01** (unblock.12 is not in the plan). `keys.06` links `unblock.01`.
- **keys.04** title includes "and shut the old site", which is also `phm.02` ("Shut down the old site; its keys go through keys.04"). `keys.04` is written to rotate or confirm dead, and leaves the shutting to `phm.02`.
- **keys.14** says "lives here, linked from E.sub"; the digest (H2.3) says it "goes into the self-hosting epic". Kept in E.keys as the plan says; the integrator should confirm.
- **keys.02** depends on `keys.08`: if `keys.08` ends with the VPS app switched off, the bearer token and the Anthropic key may only need revoking, not replacing. The guide carries both branches.
- **keys.15** waits on `fin.14`, a Finance guide; fine, noted.
- Question for Phil (money and lock-out, not decided): whether to buy Domain Guard (all domains in the contract) or DNS Pro, or to skip DNSSEC on domains that only park mail records.

## 6. Sources

1. https://www.ionos.co.uk/help/web-security/two-factor-authentication/using-an-authenticator-app-totp-for-two-factor-authentication/ : IONOS, authenticator app for two-factor authentication (checked 2026-11-28)
2. https://ionos.co.uk/help/web-security/two-factor-authentication/two-factor-authentication-recovery-code : IONOS, two-factor recovery code (checked 2026-11-28)
3. https://ionos.co.uk/help/domains/transferring-your-domain-within-ionos/disabling-the-domain-transfer-lock-with-11-ionos : IONOS, the domain transfer lock (checked 2026-11-28)
4. https://www.ionos.co.uk/help/domains/domain-guard/setting-up-and-managing-dnssec : IONOS, setting up and managing DNSSEC (Domain Guard) (checked 2026-11-28)
5. https://www.ionos.com/help/domains/dns-pro/setting-up-and-managing-dnssec : IONOS, setting up and managing DNSSEC (DNS Pro; requirements) (checked 2026-11-28)
6. https://www.ionos.co.uk/domains/domain-guard : IONOS UK, Domain Guard (price and contents) (checked 2026-11-28)
7. https://developer.mozilla.org/en-US/docs/Web/Security/Subdomain_takeovers : MDN, subdomain takeovers (checked 2026-11-28)
8. https://www.hackerone.com/blog/guide-subdomain-takeovers-20 : HackerOne, a guide to subdomain takeovers 2.0 (checked 2026-11-28)
9. https://github.com/samhaxr/can-i-take-over-xyz : can-i-take-over-xyz, community fingerprint list (checked 2026-11-28)
10. https://docs.stripe.com/keys : Stripe Docs, API keys (rotate, expire, grace period, request logs) (checked 2026-11-28)
11. https://support.stripe.com/questions/how-do-i-roll-change-update-my-stripe-api-key : Stripe Support, how do I roll my API key (checked 2026-11-28)
