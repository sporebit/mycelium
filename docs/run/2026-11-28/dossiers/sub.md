# Dossier: E.sub, Substrate (project SUB)

*Written 2026-11-28 for the run's T2 step. Plan §9 (sub.01 to sub.26), digest `digests/substrate-self-hosting.md`, plus H2.3 and H2.5 from `digests/sec-keys-and-domains.md`. Every web fact carries the day it was checked. Nothing was bought, installed, switched on or switched off in this run.*

## 1. What Phil decided

Substrate is a separate always-on box built from spare parts (enough for a whole machine), sitting beside the routers, silent or near it, for four reasons: cutting monthly costs, privacy and owning his data, not depending on companies, and learning and enjoyment; it is not about cancelling any paid service. The budget is decided after a costed list, and power is measured with a plug-in meter for a week before a limit is set. Order is network needs first (DNS filter and VPN), then Home Assistant, backups, photos and files, media, git, the worker. Nothing is exposed to the internet: VPN only, and Kirsty's phone gets the VPN. Mycelium itself keeps the hybrid (free cloud, nothing at home exposed). The platform (plain Linux with containers against a VM host) is researched and Phil approves. House basics fail safe: the internet and the light switches work with the server off, and each house service gets a "what happens when it is off" test. Backups go to a second drive plus an encrypted off-site drive at a family member's house. Photos run beside the phones' cloud for three months, then a tested restore and a decision. Each service keeps its own login in Proton Pass. Addresses are names under sporebit.com with real certificates, resolving only inside the house or over the VPN. Config lives in a git repo with a runbook per service in Docs; the first service is built by hand with a guide, then everything as code. Anything Kirsty uses changes only in one set window, never on a weeknight, with a snapshot and a rehearsed one-step revert, and the "family" group is touched only in the monthly review. Monitoring is both a push through Mycelium and a status page. Power cuts: restart cleanly by itself, tested by pulling the plug once. Done means every chosen service runs 30 days untouched; a dated ticket before June proves it (hands off from 2027-04-24, checked 2027-05-24), and a printed "if it breaks" page sits by the routers for Kirsty. H2.3: "Is there a better home than IONOS?" is one research ticket (what runs on the VPS, what Substrate replaces, a registrar comparison; mail stays at IONOS), which the plan puts in E.keys as `keys.14`, linked from here. H2.5 (assumed): the old VPS is checked by `keys.08`; nothing is switched off without Phil's word, and the VPS stays up for DropShipAuto (H6).

## 2. His kit and constraints

- **Network:** an ASUS RT-AX86U behind the 4th Utility router (double NAT, both broadcasting Wi-Fi, router to router only, managed switches unused). The network epic (E.net) splits it into four networks and decides where the DNS filter runs (`net.03`) and the remote-access route (`net.04`: the July Tailscale and Remote Desktop set-up against the router's own VPN; port 3389 never exposed). 4th Utility commitment ends May 2027.
- **Devices in the house:** cameras or a video doorbell; plugs, bulbs, sensors; voice assistants; TVs and streaming sticks. Cameras and the baby monitor are local only, no cloud, viewed over the VPN. The baby monitor is live view only, never recorded.
- **Main PC:** has an RTX 4070 and runs the Mycelium PC worker today (MYC-187).
- **Domains and DNS:** sporebit.com, with its DNS records at IONOS (the backlog's MYC-211 note names an "IONOS DNS record" for a sporebit.com subdomain). Mail stays at IONOS. An IONOS VPS hosts the first "Mycelium" (stopped mid-build 17 May 2026) and DropShipAuto; it stays up.
- **Accounts:** Proton Pass for every login; Supabase and Vercel Hobby for Mycelium; a Cloudflare R2 account is queued for Mycelium's family photos (MYC-200).
- **People:** Phil has some Linux experience and wants guides for anything new; works in 15-minute sittings. Kirsty must not notice Substrate; anything she uses is tested on her phone and left a week. Baby due about June 2027; essentials by 2027-05-15.
- **Spare parts:** "enough for a whole machine", models not yet listed. The CPU, whether it has integrated graphics, the PSU and the drives decide noise, idle power and camera detection (see §3.1 and §3.7). MYC-182 already asks Phil one answer about the backup drive.

## 3. What the research found

### 3.1 Power, and the monthly figure

- **The unit price.** Ofgem's cap for direct debit, average across Great Britain: 26.32p per kWh with a 54.83p daily standing charge for 1 October to 31 December 2026, rising to **32.69p per kWh** with 54.77p a day for 1 January to 31 March 2027. Ofgem notes there is no VAT on electricity from 1 October 2026 to 30 June 2027 [1] (checked 2026-11-28). Phil's actual tariff with his supplier is not known to this run; the figures below use the January cap. The standing charge is paid anyway and is not part of Substrate's cost.
- **The rule of thumb.** One watt drawn all month (about 730 hours) is 0.73 kWh, so **each watt costs about 24p a month** at 32.69p (about 19p at today's 26.32p).

| Idle draw at the wall | kWh a month | Monthly cost at 32.69p | Yearly |
|---|---|---|---|
| 15 W (a tuned modern Intel board, SSD only) | about 11 | about £3.60 | about £43 |
| 30 W (typical spare desktop, no graphics card, one hard drive) | about 22 | about £7.20 | about £86 |
| 50 W (older desktop or one with a graphics card) | about 37 | about £11.90 | about £143 |
| 80 W (several hard drives plus a graphics card) | about 58 | about £19.10 | about £229 |

- **What typical desktops idle at.** Wall-meter reviews of ordinary desktops put idle at roughly 50 to 66 W with a graphics card fitted [3] and about 50 to 60 W for an APU desktop [4] (checked 2026-11-28). Server builders report about 21 W at the wall with drives spun down [5], and a tuned Intel 12th or 13th generation board can reach about 7 W [6] (checked 2026-11-28). Modern Ryzen and Intel packages idle within a few watts of each other; the board, chipset, add-in cards and power settings matter more than the brand [7] (checked 2026-11-28).
- **What drives it up.** A discrete graphics card adds about 10 to 20 W at idle (about £2.40 to £4.80 a month) [8]; an add-in SATA card or any card that does not support ASPM can stop the CPU reaching deep package sleep states [8]; every spinning hard drive adds a few watts. The wall meter is the truth, not software readings [9] (checked 2026-11-28). This supports the plan's "a plug-in meter's week" step in `sub.01`.
- **So the costed list should give** the measured idle and a likely monthly figure from the table, with and without the graphics card, and with the drives Phil chooses. A UK plug-in meter is a few pounds to price; nothing is bought in this run.

### 3.2 Silence from spare parts

- **Fans:** the Noctua NF-A14 PWM is the most consistently recommended quiet 140 mm fan; be quiet! Pure Wings 2 and Silent Wings, and Fractal's Dynamic and Silent series, are cheaper quiet options. The Silent Wings Pro 4 is a high-speed fan and not the one for a quiet box [10] (checked 2026-11-28). Large fans at low PWM speed under a fan curve set in the BIOS are the quiet route; a server near idle needs very little airflow.
- **Power supply:** a semi-passive PSU keeps its fan off at light load. Reviews show the Seasonic Snow Silent 750 W never spun its fan at light loads and the Seasonic Focus Plus Platinum stays under 20 dB(A) to about 550 W [11] (checked 2026-11-28). The catch for a server: efficiency at 20 W or less falls off sharply on some units (one 550 W unit was weak at 2% load; one 1,250 W unit was under 70% efficient at 20 W) [11]. A spare high-wattage gaming PSU may waste several watts at idle; measuring it with the meter answers this.
- **Drives:** SSDs are silent; spinning drives click and hum. For "silent or near it", the system and services sit on an SSD and any hard drive (media, backups) spins down when idle, if the platform allows it.
- **Location:** beside the routers, so the box needs a cool, ventilated spot and is near the router's Ethernet ports (wired, not Wi-Fi).

### 3.3 Platform: plain Linux with containers against a VM host (`sub.02`)

- **Debian (or Ubuntu) with Docker Compose** is the simpler default for a handful of container apps; Compose files are the "everything as code" Phil asked for [12] (checked 2026-11-28).
- **Proxmox VE** earns its extra layer when full VMs, isolated guests or whole-machine snapshots are wanted. It does not replace Docker: the usual pattern is Docker inside a VM or LXC. Proxmox Backup Server backs up whole VMs [12][13]. The current release is **Proxmox VE 9.2** (21 May 2026), on Debian 13 [14] (checked 2026-11-28). Since 9.1, OCI images can become LXC containers as a technology preview, but Compose files do not apply there [13].
- **Home Assistant is the deciding factor.** Home Assistant OS (recommended by the project) brings the Supervisor, add-ons and managed updates and backups, and needs either the whole machine or a VM. Home Assistant Container has no add-ons and leaves the operating system to the owner [15] (checked 2026-11-28). On plain Debian, Home Assistant runs as a container and anything that would be an add-on (for example Frigate or Mosquitto) is its own container.
- **Snapshots, which the family rule needs.** "Snapshot first" and a "rehearsed one-step revert" are one click per VM on Proxmox. On plain Debian, the equivalent is a filesystem snapshot (Btrfs or ZFS, or LVM) plus pinned image versions in Compose so a revert is "put the old version back and restart". Either works; the Proxmox route is easier to rehearse for someone with some Linux experience.
- **A balanced shape both sides of the argument accept:** Proxmox with two guests, a Home Assistant OS VM and one Debian VM running every other service in Docker Compose. It costs a little RAM and complexity and gains per-guest snapshots and a clean revert. This is an option for Phil's approval in `sub.02`, not a decision.

### 3.4 DNS filter: AdGuard Home or Pi-hole (`sub.06`, where `net.03` decided)

- **AdGuard Home** forwards to encrypted upstreams (DNS over HTTPS, TLS or QUIC) with nothing extra and has per-device rules in its web page; **Pi-hole** has the larger community and assigns devices to groups with their own lists, and needs a helper (for example dnscrypt-proxy) for encrypted upstreams. Pi-hole v6 serves its admin page over HTTPS, which is separate from encrypted DNS [16][17] (checked 2026-11-28).
- Both can answer local names (AdGuard "DNS rewrites", Pi-hole "local DNS records"), which is how `*.sporebit.com` service names resolve only inside the house (§3.11).
- The blocking epic's "open anyway" block page and per-network rules lean towards per-client control; `net.03` and E.block decide, not this epic.
- **Fail-safe conflict:** see §5. If Substrate is the only DNS server the routers hand out, the internet stops resolving when Substrate is off, which breaks Phil's "internet works with the server off" rule.

### 3.5 VPN: WireGuard or Tailscale on the box (`sub.07`, where `net.04` decided)

- **Tailscale Personal** is free for non-commercial home use with up to 6 users and unlimited user devices; subnet routers and exit nodes, split tunnelling and MagicDNS are listed under its basics [18] (checked 2026-11-28). Devices behind a subnet router do not count towards the limit. Tailscale recommends the client on each device for best security; a subnet router suits devices that cannot run it, such as cameras [19] (checked 2026-11-28). No port is opened on either router, which suits double NAT and "nothing exposed".
- **Plain WireGuard** on Substrate needs one UDP port forwarded through both routers (double NAT) unless the 4th Utility router is put in modem mode, and a dynamic DNS name. The RT-AX86U on Asuswrt-Merlin also has its own WireGuard server; that is `net.04`'s comparison, not this epic's.
- Phil already has a Tailscale set-up from July (H2.13). For Kirsty: one app on her phone, signed in once, set to "on demand" or always on.

### 3.6 Home Assistant (`sub.08`)

- Install method per §3.3. Home Assistant OS includes its own scheduled backups; they are part of `sub.11`'s backup set, not instead of it.
- Light switches working with the server off (7.13): smart bulbs behind physical switches keep working as plain lights; Zigbee devices can be bound directly (switch to bulb) so they work without the coordinator. Anything that only works through an automation stops when Home Assistant stops; the `sub.18` test finds those.
- The wall dashboard (E.wall), the nursery and room scenes (E.home) and the baby monitor live view (E.baby) all wait for this ticket.

### 3.7 Camera recording: Frigate (`sub.10`)

- Frigate's own hardware page recommends an **Intel CPU with integrated graphics (6th generation or newer) running OpenVINO** for object detection; Intel Arc and Intel NPUs also work, and the **Coral TPU is no longer recommended** for new installs except very low-power ones [20] (checked 2026-11-28). OpenVINO can also run on the CPU and beats the old CPU detector [21].
- **Consequence for the parts list:** if the spare CPU is a Ryzen without graphics or an Intel "F" model, detection runs on the CPU (more watts, more heat, more fan noise) or needs an accelerator. `sub.01` should record whether the CPU has an iGPU.
- **Retention:** Frigate can keep only footage with motion or activity, with separate day counts for motion, alerts and detections (one example: motion 3 days, alerts and detections 30 days) [22] (checked 2026-11-28). Phil's "motion clips for a set number of days" maps to that; Phil picks the number.
- Doorbell and outdoor cameras only; the baby monitor is never added to Frigate's recording (live view through Home Assistant only).
- Kit check first: Frigate needs cameras that give a local RTSP stream; some cloud-first doorbells do not. The cameras' make and model are not in the digest (UNVERIFIED which ones Phil has).

### 3.8 Photos: Immich (`sub.12`)

- Immich v2.0.0 was announced stable on 1 October 2025 [23]; v2.5.0 added backup and restore from the web page [24] (checked 2026-11-28).
- Immich's docs are blunt: its database dump holds metadata only, not photos; a full backup is the upload folder plus a database dump, and creating, storing and testing it is the owner's job. Copying the live database folder can give a backup that cannot be restored [25] (checked 2026-11-28). The three-month trial's "tested restore" must restore both parts to a spare place and open the library.
- **iPhone background upload is not guaranteed:** iOS decides when the background task runs; opening the app more often makes it run more often [26] (checked 2026-11-28). For "invisible to Kirsty", the first bulk upload is done in the foreground on Wi-Fi, and the week's "untouched" test watches whether new photos arrive without opening the app.
- This runs **beside** iCloud or Google Photos for three months (Phil's rule) and is separate from MYC-200 (Cloudflare R2 for Mycelium's own family photos).

### 3.9 Files and sync: Nextcloud or Syncthing (`sub.13`)

- **Syncthing has no official iPhone app** and its team does not plan one; the third-party Möbius Sync is the iOS route (paid to remove a small limit, price UNVERIFIED today) [27] (checked 2026-11-28).
- **Nextcloud's iOS app** does camera auto-upload and file access on demand [27][28] (checked 2026-11-28). Nextcloud is heavier (database, cron, more updates).
- A common split: Syncthing between the PC, laptop and Substrate (folders mirrored, no server needed), and phones reach files over the VPN through WebDAV or a small file browser [27].
- **"Backups of phones":** a full iPhone device backup cannot go straight to a Linux server; photos go through Immich, files through the chosen app, and a full device backup stays in iCloud or in a PC backup copied to Substrate. UNVERIFIED against Apple's current documentation; `sub.13` states it as "check first".

### 3.10 Media, books, feeds, paperwork, git

- **Jellyfin** gives Intel Quick Sync hardware transcoding and remote access free; on **Plex**, hardware transcoding needs a Plex Pass and remote streaming from a server without one needs a paid Remote Watch Pass. Plex Pass prices in the sources conflict (one gives the lifetime pass rising to $749.99 in July 2026), so they are UNVERIFIED [29][30] (checked 2026-11-28). The existing ticket MCU-12 already plans "set up the Plex server" (see §5).
- **Audiobookshelf** for audiobooks (its iPhone app tracks progress across devices); **Calibre-Web Automated** for ebooks, with native Kobo sync of library and reading progress [31] (checked 2026-11-28).
- **Feeds:** FreshRSS and Miniflux both speak the Google Reader and Fever APIs so phone apps connect; FreshRSS needs "Allow API access" switched on and a separate API password; Miniflux is lighter and needs PostgreSQL [32] (checked 2026-11-28). Mycelium's digest would read the reader's API or the same feed list.
- **Paperless-ngx** runs as a web container, a worker and Redis; it watches a "consume" folder, reads (OCR) and files each document. Scanners usually save to that folder over a network share (SMB), or by FTP, SFTP or email. Share permissions are the known pain point [33][34] (checked 2026-11-28).
- **Git and runners:** Forgejo (community-governed, GPL) and Gitea (company-run, MIT) are close relatives; Forgejo Actions runs jobs from `.forgejo/workflows` or `.github/workflows` on a separate Forgejo Runner in Docker; neither promises full GitHub Actions compatibility, and the runner's Docker access is a security boundary to think about [35][36] (checked 2026-11-28).

### 3.11 Names and certificates under sporebit.com (`sub.05`)

- A wildcard certificate (`*.sporebit.com` or `*.home.sporebit.com`) needs the **DNS-01 challenge** [37] (checked 2026-11-28).
- **At IONOS:** the lego ACME client has an `ionos` provider (since v4.2.0) using one IONOS Hosting DNS API key in the form prefix-dot-secret, created in the IONOS developer area [38][39] (checked 2026-11-28). Caddy has a `caddy-dns/ionos` module (built into Caddy with xcaddy) [40]; Traefik uses lego underneath. One Traefik user's IONOS wildcard attempt did not complete in the forum thread [37]. Note: IONOS Cloud DNS is a different product with different keys [40].
- **Via Cloudflare:** the free plan only offers the full set-up, which means moving the **whole** sporebit.com zone's nameservers to Cloudflare; the partial (CNAME) set-up is Business or Enterprise only, and subdomain delegation is Enterprise [41] (checked 2026-11-28). Moving the zone would carry sporebit.com's mail records too (MX, SPF, DKIM, DMARC for the IONOS mailboxes), which is an E.mail and E.keys matter. Not recommended as the first route.
- **Inside-only resolving:** no public A records for the service names; the DNS filter answers them with Substrate's house address, and VPN clients use the house DNS. The only public record is the short-lived challenge TXT record.
- **Certificate transparency:** every publicly trusted certificate is logged publicly, so per-service certificates would publish each service's name; a wildcard keeps them private. (General knowledge of CT logs; not separately sourced, UNVERIFIED by a page this run.)
- **The key is a new secret:** the IONOS API key can change DNS records (UNVERIFIED whether it can be limited to one zone). It goes in Proton Pass and in Substrate's secret store only, never in the config repo. A narrower option is to point `_acme-challenge` at a separate small zone by CNAME so the key only touches that zone; `sub.05` offers it as a choice.

### 3.12 Backups: restic or borg, second drive and an off-site drive (`sub.11`)

- Both encrypt on the client and can mount a snapshot to copy one file out. restic is always encrypted and can write to local drives or object storage; borg (1.4 is the stable series; 2.0 still test-only) works best over SSH and its keyfile mode needs the key kept separately. For a local second drive and a carried off-site drive, either works [42] (checked 2026-11-28).
- The off-site drive at a family member's house means a rotation (two drives swapped on visits, or one drive refreshed on a set visit). The backup password lives in Proton Pass; **losing it loses every backup**, so a sealed printed copy belongs with the "if it breaks" page or another safe place Phil chooses.
- What goes in: the config repo, each service's data and database dumps (Immich and Paperless dumps taken properly, §3.8), Home Assistant's backups, and the Proxmox VM backups if that route is chosen.

### 3.13 Power-cut restart (`sub.03`)

- The BIOS setting is called "Restore on AC Power Loss", "AC Power Recovery" or "After Power Loss" (ASUS: Advanced, APM; MSI: Advanced, Power Management Setup; Gigabyte: Chipset). Options are Power Off (the usual default), Power On and Last State; **Power On** is the one for Substrate [43][44] (checked 2026-11-28).
- ASUS warns a very short blip may not trigger it and suggests leaving the PSU off about 30 seconds when testing; Intel's test is power off, unplug, plug back in [43][45] (checked 2026-11-28). That matches Phil's "pulling the plug once".
- After power returns, the routers take a minute or two; containers set to restart "unless stopped" and VMs set to "start at boot" come back on their own, and the DNS filter's fallback (§5) covers the gap.

### 3.14 Monitoring and the status page (`sub.09`, `sub.21`)

- **Uptime Kuma** (2.x, now with MariaDB as an option and rootless Docker) runs checks, publishes multiple status pages and sends webhooks when a check goes down [46] (checked 2026-11-28). A webhook to a Mycelium endpoint gives the "push through Mycelium"; the status page is reachable only inside the house or over the VPN.
- Device alerts (a new device joins, a camera sends gigabytes somewhere new) are E.net's network-monitoring job; Substrate hosts the tool.

### 3.15 H2.3 and H2.5 (context, owned by E.keys)

- `keys.14` (a better home than IONOS: what runs on the VPS, what Substrate replaces, registrar comparison; mail stays) and `keys.08` (what the old VPS is doing now; recommended "export its data, then switch off"; nothing switched off without Phil's word) are in E.keys. Substrate can host what the VPS ran for the first Mycelium (Postgres and FastAPI, an hourly mail-reading agent) but **not** anything that must be reachable from the internet, because nothing at home is exposed. DropShipAuto's public endpoints therefore stay on the VPS (H6).

## 4. Risks

| Risk | What it would break | Mitigation the tickets carry |
|---|---|---|
| DNS filter on Substrate is the only DNS, and Substrate is off | The whole house's internet stops resolving; Kirsty notices at once | `sub.06` asks for a fallback resolver (on the router or a second instance) before the routers hand out Substrate; `sub.18` tests it with the server off; flagged in §5 |
| A family service changes on a weeknight and breaks | Kirsty's photos, VPN or lights | `sub.20` one set window, snapshot, rehearsed one-step revert; `sub.19` week untouched on her phone; `sub.24` printed page |
| The backup password or the off-site key is lost | Every backup is unreadable (data loss) | `sub.11` stores it in Proton Pass and a sealed printed copy; `sub.23` restore test per service at set-up and yearly rebuild drill |
| Immich restore is incomplete (database without files, or a live-copied database) | Photo library lost after the three months | `sub.12` keeps the phones' cloud running throughout and restores both parts before any decision |
| Moving sporebit.com's DNS to Cloudflare for certificates | Mail for sporebit.com addresses and Mycelium's own address | `sub.05` uses the IONOS API route; any nameserver move is a separate decision with E.mail, never in this run |
| The IONOS DNS API key leaks | Someone could change DNS records for the domains in the account | `sub.05`: key in Proton Pass and Substrate's secret store only, never in git; the narrower CNAME-to-a-small-zone option offered |
| Power cut, box stays off | DNS, VPN and cameras down until someone presses the button | `sub.03` BIOS "Power On" and the pulled-plug test |
| Exposing a port by mistake | Contradicts "nothing exposed" | VPN only (`sub.07`); E.net's outside scan and monthly review |
| Spare GPU left in the box, old PSU | About £2.40 to £4.80 a month per 10 to 20 W, extra noise | `sub.01` measures with and without; budget set after; `sub.17` prices the GPU question |
| Hands-off month overlaps the April monthly review, the broadband change and baby preparation | The 30-day proof restarts | `sub.25` and `sub.22` say the April 2027 review only reads Substrate, no updates |
| Upkeep eats evenings (Phil's stated reason to switch it off) | The project is abandoned | 15-minute phases; services as code; monthly-only updates (`sub.22`); `sub.26` done check |
| Money | Parts, drives, a meter | Every ticket with a purchase says "to be priced; nothing is bought in this run"; the budget comes after `sub.01` |

## 5. Facts that differ from the plan

- **sub.06 against 7.13 ("internet works with the server off"):** if the routers hand out only Substrate's address for DNS, the house loses name resolution when Substrate is off. The plan has no ticket for a fallback. `sub.06` now carries "a fallback resolver decided with `net.03` before cut-over" and `sub.18` tests it; the integrator should check `net.03` names this too. Adding a public resolver as the second DNS lets devices bypass the filter at random, so the fallback is a judgement for `net.03`, not this epic.
- **sub.25 date window:** hands-off runs Saturday 2027-04-24 to Monday 2027-05-24 (30 days). The monthly network review `net.24` (recurring on the 28th) and `sub.22` (updates in the monthly review) land on 2027-04-28, inside the window; that review must only read Substrate, not update it, or the proof restarts. The 4th Utility commitment ends May 2027 and the broadband review is dated 2027-03-01: a router swap between 24 April and 24 May would also restart the proof. Baby essentials are due 2027-05-15 in the same window (plan §27 point 2 already notes the crowding).
- **sub.14 against MCU-12:** an existing ticket, MCU-12 "Stage F: rename films and TV to Plex naming and set up the Plex server", already plans Plex. Plex hardware transcoding and remote streaming are paid; Jellyfin's are free. `sub.14` is written as "choose the media server (Plex or Jellyfin)" and links MCU-12; whether MCU-12 is re-parented, kept or closed is Phil's.
- **sub.05 "real certificates" and the DNS host:** sporebit.com's DNS is at IONOS, which has a working DNS-01 route (lego `ionos`, `caddy-dns/ionos`). Cloudflare's free plan cannot take a subdomain alone; it needs the whole zone moved, mail records included. The ticket uses IONOS; a Cloudflare move would be its own decision with E.mail.
- **sub.05 new secret:** the plan does not list the IONOS DNS API key as a new secret. It should be named in E.keys' inventory (`keys.01`) when created.
- **sub.10 hardware dependency:** Frigate now recommends an Intel iGPU with OpenVINO, not a Coral. `sub.01` must record whether the spare CPU has integrated graphics; a Ryzen without graphics or an Intel F-series CPU changes the camera plan or the power figure.
- **sub.13 "phone backups":** a full iPhone device backup cannot go straight to a self-hosted Linux server (UNVERIFIED against Apple's current pages). The ticket covers photos, files and a copied PC backup; whole-device backups stay where they are. Phil decides on the ticket.
- **sub.08 depends only on sub.06:** Home Assistant also needs the platform choice from `sub.02` (Home Assistant OS needs a VM or the whole machine). It follows through `sub.06` after `sub.04` after `sub.03` after `sub.02`, so no change is needed, but the install method is set in `sub.02`.
- **keys.14 lives in E.keys** (plan §4) although the digest says H2.3 "goes into the self-hosting epic". The plan's note says "lives here, linked from E.sub"; this epic links it. The integrator may move it.
- **sub.01 who and order:** the plan marks `sub.01` as C, but a costed list of spare parts and "a plug-in meter's week" need Phil twice (listing the parts, and plugging a bench-assembled machine into a meter for a week) and the meter is not yet in the house. The ticket keeps C and names Phil's two short parts; the integrator may make it PC. A meter week before `sub.03` means a temporary bench assembly; otherwise the measured figure arrives after `sub.03` and the budget line waits for it.
- **Electricity VAT:** Ofgem's page says there is no VAT on electricity from 1 October 2026 to 30 June 2027 [1]. If that ends on 1 July 2027, the monthly figure rises by the VAT rate from then; the costed list should say so.

## 6. Sources

1. https://www.ofgem.gov.uk/your-energy-supply/your-energy-bill/energy-price-cap-unit-rates-and-standing-charges, Ofgem, energy price cap unit rates and standing charges (checked 2026-11-28)
2. https://www.ofgem.gov.uk/energy-price-cap, Ofgem, energy price cap (checked 2026-11-28)
3. https://bit-tech.net/reviews/tech/amd-ryzen-7-1700-review/6/, bit-tech, Ryzen 7 1700 review, power consumption at the wall (checked 2026-11-28)
4. https://www.guru3d.com/articles-pages/amd-ryzen-5-3400g-review,4.html, Guru3D, Ryzen 5 3400G review, power (checked 2026-11-28)
5. https://forums.unraid.net/topic/97358-whats-your-idle-power-consumption/, Unraid forum, what is your idle power consumption (checked 2026-11-28)
6. https://mattgadient.com/7-watts-idle-on-intel-12th-13th-gen-the-foundation-for-building-a-low-power-server-nas, Matt Gadient, 7 watts idle on Intel 12th and 13th gen (checked 2026-11-28)
7. https://igorslab.de/en/intel-core-i9-11900k-core-i7-11700k-core-i5-11600k-und-core-i9-10900k-gegen-amds-aktuelle-ryzen-garde-schnell-heiss-und-ganz-schoen-durstig-2/10, Igor's Lab, idle power consumption (checked 2026-11-28)
8. https://computingforgeeks.com/build-low-power-home-server/, ComputingForGeeks, build a low power home server (checked 2026-11-28)
9. https://sumguy.com/idle-watts-audit/, SumGuy, your server is doing nothing, loudly (checked 2026-11-28)
10. https://silentpcreview.com/forums/viewtopic.php?p=600975, SilentPCReview forum, quiet 140 mm fans (checked 2026-11-28)
11. https://www.tomshardware.com/reviews/seasonic-snow-silent-750w-power-supply,4200-5.html and https://www.tomshardware.com/reviews/phanteks-amp-series-550w-power-supply-review/2, Tom's Hardware PSU reviews (checked 2026-11-28)
12. https://www.virtualizationhowto.com/2026/10/do-you-really-need-proxmox-if-you-only-run-docker/, Virtualization Howto, do you really need Proxmox if you only run Docker (checked 2026-11-28)
13. https://petronellatech.com/guides/proxmox-docker-decision/, Petronella, Proxmox and Docker decision guide (checked 2026-11-28)
14. https://www.proxmox.com/en/about/press-releases/proxmox-virtual-environment-9-2, Proxmox, Proxmox VE 9.2 press release (checked 2026-11-28)
15. https://community.home-assistant.io/t/installation-methods-community-guides-wiki/199545, Home Assistant community, installation methods (checked 2026-11-28)
16. https://www.wundertech.net/adguard-home-vs-pi-hole-best-ad-blocker/, WunderTech, AdGuard Home vs Pi-hole in 2026 (checked 2026-11-28)
17. https://www.github.com/AdguardTeam/AdGuardHome/wiki/Comparison, AdGuard Home wiki, comparison (vendor) (checked 2026-11-28)
18. https://tailscale.com/pricing?plan=personal, Tailscale, pricing, Personal plan (checked 2026-11-28)
19. https://tailscale.com/kb/1019/subnets, Tailscale, subnet routers (checked 2026-11-28)
20. https://docs.frigate.video/frigate/hardware, Frigate, recommended hardware (checked 2026-11-28)
21. https://docs.frigate.video/configuration/object_detectors, Frigate, object detectors (checked 2026-11-28)
22. https://docs.frigate.video/configuration/record, Frigate, recording (checked 2026-11-28)
23. https://immich.app/blog/stable-release, Immich, stable release (checked 2026-11-28)
24. https://immich.app/blog/v2.5.0-release, Immich, v2.5.0 release (checked 2026-11-28)
25. https://docs.immich.app/administration/backup-and-restore, Immich, backup and restore (checked 2026-11-28)
26. https://docs.immich.app/features/mobile-backup, Immich, mobile backup (checked 2026-11-28)
27. https://selfhosting.sh/compare/nextcloud-vs-syncthing/, selfhosting.sh, Nextcloud vs Syncthing (2026) (checked 2026-11-28)
28. https://apps.apple.com/us/app/nextcloud/id1125420102, App Store, Nextcloud (checked 2026-11-28)
29. https://www.tech-insider.org/jellyfin-vs-plex-2026/, Tech Insider, Jellyfin vs Plex 2026 (checked 2026-11-28)
30. https://www.wundertech.net/jellyfin-vs-plex-side-by-side-comparison/, WunderTech, Jellyfin vs Plex (checked 2026-11-28)
31. https://github.com/crocodilestick/Calibre-Web-Automated/wiki/Kobo-Integration-&-Sync, Calibre-Web Automated wiki, Kobo integration and sync (checked 2026-11-28)
32. https://selfhosting-sh.pages.dev/compare/freshrss-vs-miniflux/, selfhosting.sh, FreshRSS vs Miniflux (2026) (checked 2026-11-28)
33. https://docs.paperless-ngx.com/usage, Paperless-ngx, usage overview (checked 2026-11-28)
34. https://github.com/paperless-ngx/paperless-ngx/discussions/6277, Paperless-ngx discussions, consume folder on a network share (checked 2026-11-28)
35. https://www.virtualizationhowto.com/2026/09/i-tried-forgejo-in-my-home-lab-it-might-be-the-easiest-self-hosted-git-server-yet/, Virtualization Howto, Forgejo in a home lab (checked 2026-11-28)
36. https://www.hetzner.com/blog/community-owned-git-hosting-with-forgejo/, Hetzner, community-owned git hosting with Forgejo (checked 2026-11-28)
37. https://community.traefik.io/t/traefik-ionos-wildcard-certificate-config/17541, Traefik community, Traefik and IONOS wildcard certificate (checked 2026-11-28)
38. https://go-acme.github.io/lego/dns/ionos/, lego, IONOS DNS provider (checked 2026-11-28)
39. https://www.ionos.co.uk/help/domains/configuring-your-ip-address/set-up-dynamic-dns-with-company-name/, IONOS help, API key prefix and secret (checked 2026-11-28)
40. https://beta.pkg.go.dev/github.com/caddy-dns/ionos, Go packages, caddy-dns/ionos (checked 2026-11-28)
41. https://developers.cloudflare.com/dns/zone-setups/partial-setup/, Cloudflare, CNAME (partial) set-up (checked 2026-11-28)
42. https://dev.to/selfhostingsh/restic-vs-borgbackup-which-backup-tool-to-use-4cmn, selfhosting.sh, restic vs BorgBackup (checked 2026-11-28)
43. https://www.asus.com/uk/support/faq/1049855/, ASUS, BIOS item Restore AC Power Loss (checked 2026-11-28)
44. https://us.msi.com/faq/11250 and https://www.gigabyte.com/Support/FAQ/3497, MSI and Gigabyte FAQs, restore after AC power loss (checked 2026-11-28)
45. https://www.intel.com/content/www/us/en/support/articles/000059976.html, Intel, after power failure setting (checked 2026-11-28)
46. https://raw.githubusercontent.com/louislam/uptime-kuma/master/README.md, Uptime Kuma README (checked 2026-11-28)
