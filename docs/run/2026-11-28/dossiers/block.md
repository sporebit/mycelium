# Dossier: E.block, Blocking (SEC)

*Written 2026-11-28 by a dossier agent in the unattended run. Every product fact below was looked up on 2026-11-28; anything that could not be confirmed is marked UNVERIFIED. Nothing was installed, changed or switched on.*

## 1. What Phil decided

Phil wants the BBC, the Daily Mail, ITV and further outlets (proposed by a research ticket with a reason each from four allowed sources: upheld regulator rulings and published corrections, independent fact-checker records, ownership and funding, examples he supplies; he approves each one) blocked from his life, everything from a listed outlet and not only its news. Strength is **block with an "open anyway" page**: quick for news, a 10-minute wait for adult sites, and the wait grows the week after many open-anyways. The block page shows his next thing from Mycelium with a Start button, how many times he has landed there this week, and one of his saved quotes. The filter is the one network-wide DNS filter from E.net (where it runs is the `net.03` research), with per-person profiles from the start: Phil; Kirsty (unfiltered for news, she can opt in); guests (adult and security lists, not news); a future child. The same filter follows his phones away from home through a profile. On his devices the bypasses are closed (browsers' own encrypted DNS, iCloud Private Relay, VPN and proxy apps); inside X, Reddit and similar apps nothing changes. YouTube channel blocking on the PC and "don't recommend" on phones and TVs; a results-filter extension on the PC; built-in news feeds off on every device; Alexa's default news and radio changed; podcasts unfollowed; emails cleared in the mail migration's sender sweep. Kirsty is asked before any shared TV changes; Sky Glass is researched first; the TV licence rules are checked from the official source. The filter also carries scam, malware and tracker lists, plus social app limits (a daily minute allowance per app and blocked hours, tightest in the four weak spots). A weekly digest from sources he chooses, grouped by four topics, is read in the Sunday close-out beside Finds, with an owner-only weekly count; official alerts only are pushed. Done means 30 days without seeing a listed outlet unless he chose to. The 26 November guide (soft hide, NextDNS, 26 steps) is input to the research, not the plan (H10).

## 2. His kit and constraints

- Devices in scope: iPhone 17 Pro, Pixel, the main PC (Windows), TVs and streaming sticks (LG, Samsung, Sky Glass, a Fire Stick), Alexa.
- Network: RT-AX86U on Asuswrt-Merlin 3004.388 behind the 4th Utility router (see `dossiers/net.md`); the filter's home is undecided (`net.03`); Substrate may host it (`sub.06`).
- Mycelium already holds the Sunday close-out, Finds, saved quotes and the next-thing card; the block page is a Mycelium build (`block.05`).
- Shared TVs are Kirsty's as much as his: nothing changes on them before `block.02`.

## 3. What the research found

### 3.1 The block page over HTTPS: the one hard constraint

- A DNS filter blocks by answering with a null address or with the address of a block page. For an **HTTPS** site the browser then expects a certificate for the blocked name; without one it shows a security error, not the block page.
- **NextDNS** staff: "you always need a custom root CA to support blockpages over HTTPS", and it "has to be installed on every single host"; installing it on the router does not help [1][2]. NextDNS's own guide covers Windows, macOS, iOS (Settings, General, About, Certificate Trust Settings, full trust), Android, Linux, Chrome and Firefox [1]. NextDNS's CEO notes the trade-off: if the CA's keys were stolen, someone able to redirect his traffic could impersonate any HTTPS site to him [2].
- **Control D** offers a "Branded" block page it hosts (logo, title, message, an external link) or a "Custom" option where you give your own IPv4 and IPv6 address to answer blocked names with [6]. The same certificate problem applies to an HTTPS site redirected to either (UNVERIFIED for Control D specifically; the mechanism is the same).
- **Pi-hole** removed its block page in 2022 and its staff say it "won't return" because of HTTPS [11].
- **AdGuard Home** can answer blocked names with a custom address (general knowledge, UNVERIFIED in this run); same certificate problem.
- **HSTS-preloaded sites** (the BBC and most large outlets serve HSTS; UNVERIFIED per outlet) refuse even a click-through on a certificate error, so a self-signed block page is a dead end without a trusted local CA.
- What this means for `block.05` (options, none decided): (a) install a private root CA on Phil's own devices only (PC, iPhone, Pixel) and serve the block page from Mycelium or the Substrate box with certificates minted on the fly, accepting the CA risk above; (b) no CA: the DNS filter returns a plain failure, and the "open anyway" lives in Mycelium (a button on the phone's next-thing card and a page Phil opens himself), plus a browser extension on the PC that does show a real block page; (c) a hosted filter's branded page with its own CA (NextDNS) for display, with "open anyway" done through the filter's API. Phones' in-app browsers and TVs will only ever show a failure.
- **"Open anyway" and the wait** need the filter to accept an allow rule per device for a time: NextDNS has a documented API and community tools that add and remove allowlist entries (the allowlist is rewritten with a PUT, per a forum answer, UNVERIFIED against the API docs) [3][4]; AdGuard Home has a local API with per-client settings and blocked-service schedules [9]; Control D has custom rules with Block, Bypass and Redirect [7]. DNS caching on the device means an "open" can take up to the record's lifetime to take effect, and a re-block likewise (general behaviour; the filter's own TTL setting governs it).

### 3.2 The filter services compared (for `net.03` and `block.03`)

| | NextDNS | Control D | AdGuard Home (self-hosted) | Pi-hole v6 (self-hosted) |
|---|---|---|---|---|
| Cost | Free to 300,000 queries a month, then **filtering stops and queries resolve unfiltered** until the next month; Pro about US$1.99 a month or US$19.90 a year [5] | Personal plans about US$3 and US$6 a month; **redirect rules need the US$6 "Full Control" tier** (Control D's own pricing guide, treat as vendor material) [8] | Free; runs on the router (see `dossiers/net.md`) or the Substrate box | Free; same |
| Profiles per person | Profiles (configurations), per device by installing the profile or app on each device [5] | Profiles assigned to devices, switchable on a schedule [7] | Per client by address or ID [9] | Groups per client [12] |
| Block page | Branded, needs its root CA on each device [1] | Branded hosted page or your own address [6] | Custom address | None since 2022 [11] |
| Away from home | Yes (DoH or DoT profile, app) | Yes | Only over the VPN | Only over the VPN |
| Time schedules | "Recreation time" per service (one window a day per service, per a competitor's claim, UNVERIFIED) | Schedules on profiles [7] | Blocked-service schedules per client [9] | Groups and scripts |

- The 26 November guide's figures (300,000 queries, US$1.99 a month or US$19.90 a year) match current reviews [5]. At 20 to 40 devices the free tier will likely run out mid-month, after which nothing is blocked: a paid tier or a self-hosted filter is needed for "block" to mean block (estimate, UNVERIFIED for this house's query volume).
- **Minute allowances per app** (9b: "a daily minute allowance per app") cannot be done by DNS, which sees lookups, not minutes. DNS can block an app's domains during set hours. Minute allowances live in the phone's own controls: **Screen Time App Limits** on the iPhone and **Digital Wellbeing app timers** on the Pixel (general knowledge, not separately sourced this run). `block.17` is written that way.

### 3.3 Closing the bypasses (for `block.06` and `block.07`)

- **iCloud Private Relay:** Apple documents a per-network switch, **"Limit IP Address Tracking"**, that turns Private Relay off on one network [15], and says networks may block Private Relay by answering `mask.icloud.com` and `mask-h2.icloud.com` with no address [14]. Control D and other filters do exactly that [10]. Blocking those names causes a delay of up to about 30 seconds on Apple devices before they fall back (Cisco and a Pi-hole user report) [14][16]. Private Relay covers Safari and some app traffic, not all; with a DNS profile installed on the iPhone, a NextDNS thread reports the profile and Private Relay can coexist on iOS 18 (single report, UNVERIFIED) [18]. Simplest for Phil's own iPhone: **turn Private Relay off in Settings, his name, iCloud, Private Relay**, and rely on the DNS profile.
- **Firefox:** honours the **canary domain** `use-application-dns.net` only for DoH it switched on by default, not for DoH the user turned on [13]. Set Firefox's own DNS over HTTPS to Off, or point it at the filter's DoH address.
- **Chrome and Edge:** "Secure DNS" upgrades to the same provider's DoH when the system resolver is on its list; a custom provider can be set by hand [17]. Set "Use secure DNS" to the filter's own DoH address (or Off) on the PC; the Pixel's Chrome follows Android's Private DNS.
- **Windows 11:** Settings, Network and internet, the connection, DNS server assignment, Edit, Manual, with "DNS over HTTPS" per address; automatic templates only exist for a built-in list of providers (`netsh dns show encryption` lists them) [19]. A custom template is possible for NextDNS or Control D (UNVERIFIED for this run).
- **Android (Pixel):** **Private DNS** takes a hostname (DNS over TLS), not an address; set it to the filter's hostname, which also makes it the away-from-home filter [20].
- **iPhone away from home:** an encrypted DNS configuration profile (Apple's DNSSettings payload, DoH or DoT) installed manually under Settings, General, VPN and Device Management [21]. iOS 18 users report profiles not shown in Settings after install and mobile data stopping on one model with a profile (single reports) [22]. A profile can be removed by the phone's user at any time; that matches "off switch: him, at any time".
- **VPN and proxy apps:** a DNS filter cannot see inside another VPN. On his own devices, remove VPN and proxy apps and (iPhone) use Screen Time's content restrictions to stop new profiles being added only if he wants a lock (his off switch must stay available).

### 3.4 TVs, Sky Glass and the licence

- **Sky Glass:** community consensus (not Sky's own help page) is that the home screen and its rails **cannot be customised or hidden**; apps can be locked with a PIN per app under Settings, Parental, Manage parental settings [23][24]. A DNS block will break the BBC and ITV apps on Sky Glass for everyone in the room, which is why `block.02` (ask Kirsty) gates `block.16`.
- **TV licence (from TV Licensing, the official source):** a licence is needed to watch or record **live TV on any channel or service**, and to watch **anything on BBC iPlayer**, live or on demand, on any device; none is needed if a household only ever watches on-demand programmes on services other than iPlayer. A licence is per address [25]. Blocking the BBC on Phil's devices does not change the household's need if Kirsty or a shared TV watches live TV; `block.15` writes this down and changes nothing.

## 4. Risks

| Risk | Mitigation carried by the tickets |
|---|---|
| **A private root CA** on his devices (if `block.05` takes that road) could let anyone holding its key impersonate any site to him | `block.05` lists it as an option with the risk stated; the cautious default is the no-CA design; Phil decides. |
| **Kirsty-facing breakage** on shared TVs and Alexa | `block.02` first; `block.03` gives Kirsty a news-unfiltered profile; shared TVs change only in `block.16`. |
| **The free tier running out** and filtering silently stopping | `block.03` records the query count after a week and prices the paid tier; nothing bought. |
| **Lock-out from the internet** through a bad DNS Director rule or a dead filter box | `block.03` keeps a second upstream and the router's own DNS as fallback; the simple-mode switch (`net.20`) bypasses the filter. |
| **Phone mobile data breaking** after a DNS profile (iOS 18 reports) | `block.07` tests on mobile data in the same sitting and says how to remove the profile. |
| **Money** | Paid filter tiers and any extension are "to be priced"; nothing bought in this run. |

## 5. Facts that differ from the plan

- **block.05** assumes a block page that appears when he lands on a listed site. On HTTPS sites a DNS filter cannot show any page without a root CA trusted on each device [1][2][11]; HSTS sites will not even allow a click-through. The ticket is rewritten as a design choice between three options (§3.1) before any build. The integrator may want to split it into a decision ticket and a build ticket.
- **block.17** says social app limits are set "on the filter" with "a daily minute allowance per app". DNS can do blocked hours only; minute allowances need Screen Time (iPhone) and Digital Wellbeing (Pixel). The ticket covers both, the filter part for hours and the phone part for minutes.
- **block.03** depends on `net.03` only; if `net.03` picks the Substrate box, it also waits on `sub.06` (plan §25 already shows this chain). Kept as in the plan, noted on the ticket.
- **block.06** says "one sitting per device"; with three devices that is three sittings in one guide, about 15 minutes each. Kept; points left at 2.
- **block.08** has `after block.01, link mail.27`. Kept as written; `mail.27` goes in `links`.
- **NextDNS free tier**: "stops at 300,000 queries" means filtering stops and queries pass unfiltered [5]; the 26 November guide's wording suggested a hard stop. Matters for the Done check.
- Question for Phil (lock-out and security trade-off, not decided): whether a private root CA on his own phone and PC is acceptable for a real block page.

## 6. Sources

1. https://help.nextdns.io/t/g9hmv0a/how-to-install-and-trust-nextdns-root-ca : NextDNS, how to install and trust the NextDNS Root CA (checked 2026-11-28)
2. https://help.nextdns.io/t/y4h7frw/nextdns-block-page-with-root-ca-a-strange-quirk : NextDNS help, block page with root CA (staff answers) (checked 2026-11-28)
3. https://nextdns.github.io/api/ : NextDNS API documentation (named by NextDNS help; not opened this run, UNVERIFIED) (checked 2026-11-28)
4. https://pypi.org/project/nextdnsctl/ : nextdnsctl, a CLI for NextDNS allowlists and denylists (checked 2026-11-28)
5. https://www.techradar.com/reviews/nextdns : TechRadar, NextDNS review (free 300,000 queries, Pro US$1.99 a month or US$19.90 a year) (checked 2026-11-28)
6. https://docs.controld.com/docs/blocked-query-response : Control D, Blocked Query Response (custom block pages) (checked 2026-11-28)
7. https://docs.controld.com/docs/custom-rules : Control D, Custom Rules (checked 2026-11-28)
8. https://controld.com/blog/control-d-pricing-guide/ : Control D, pricing guide 2026 (vendor) (checked 2026-11-28)
9. https://adguard-dns.io/kb/adguard-home/clients/ : AdGuard Home, clients and per-client settings (checked 2026-11-28)
10. https://docs.controld.com/docs/icloud-private-relay : Control D, iCloud Private Relay (checked 2026-11-28)
11. https://discourse.pi-hole.net/t/custom-block-page-in-v6/78419 : Pi-hole forum, custom block page in v6 (checked 2026-11-28)
12. https://docs.pi-hole.net/group_management/groups : Pi-hole, group management (checked 2026-11-28)
13. https://support.mozilla.org/kb/canary-domain-use-application-dnsnet : Mozilla, canary domain use-application-dns.net (checked 2026-11-28)
14. https://developer.apple.com/support/prepare-your-network-for-icloud-private-relay/ : Apple, prepare your network for iCloud Private Relay (checked 2026-11-28)
15. https://support.apple.com/en-us/102022 : Apple, manage iCloud Private Relay for specific networks (checked 2026-11-28)
16. https://discourse.pi-hole.net/t/limit-ip-address-tracking-setting-on-ios-circumvents-ad-blocking/52707 : Pi-hole forum, Limit IP Address Tracking and Private Relay host names (checked 2026-11-28)
17. https://www.chromium.org/developers/dns-over-https : Chromium, DNS over HTTPS (same-provider upgrade) (checked 2026-11-28)
18. https://help.nextdns.io/t/35yl8c7/install-issue-for-iphone-with-ios-18-3 : NextDNS help, iOS 18 profile install (checked 2026-11-28)
19. https://www.howtogeek.com/765940/how-to-enable-dns-over-https-on-windows-11/ : How-To Geek, DNS over HTTPS on Windows 11 (checked 2026-11-28)
20. https://android-developers.googleblog.com/2018/04/dns-over-tls-support-in-android-p.html : Android Developers Blog, Private DNS (DNS over TLS) (checked 2026-11-28)
21. https://support.apple.com/guide/deployment/dep7e19a4b12/web : Apple Platform Deployment, DNS settings payload (checked 2026-11-28)
22. https://help.nextdns.io/t/x2ylmx2/installed-dns-profiles-not-showing-on-ios-18-setting-app : NextDNS help, profiles not showing on iOS 18 (checked 2026-11-28)
23. https://www.internetmatters.org/parental-controls/smartphones-and-other-devices/sky-glass/ : Internet Matters, Sky Glass parental controls (checked 2026-11-28)
24. https://helpforum.sky.com/t5/Sky-Glass/How-do-I-customise-home-screen-on-sky-glass/m-p/4887532 : Sky Community, customising the Sky Glass home screen (checked 2026-11-28)
25. https://www.tvlicensing.co.uk/check-if-you-need-one : TV Licensing, check if you need one (checked 2026-11-28)
