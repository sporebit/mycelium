# Dossier: E.net, Home network (SEC)

*Written 2026-11-28 by a dossier agent in the unattended run. Every product fact below was looked up on 2026-11-28; anything that could not be confirmed is marked UNVERIFIED. Nothing was changed on any router, account or device.*

## 1. What Phil decided

Phil wants four networks on the RT-AX86U (Trusted, Work, Smart devices, Guests) with names that reveal nothing about him or the house, one network-wide DNS filter that carries both the security blocklists and the topic 9 content blocking, remote access through a VPN only (port 3389 never exposed), and the ASUS as the only router if 4th Utility allows it. The first ticket is an audit of both routers plus an outside scan, because he is not sure what is open today. Kirsty's devices sit on Trusted with his. Smart devices are blocked from the internet where they still work, otherwise allowed only their own cloud; cameras and the coming baby monitor stay local and are viewed over the VPN. Unknown devices joining trigger a push through Mycelium inside the interruption budget; the device inventory lives in Mycelium beside the home inventory. The bar is "as strong as possible" inside his earlier answers: kit up to £100, invisible to Kirsty, a labelled simple-mode switch and a printed card. Settings are kept as scripts in a git repo, applied by Claude Code, each change approved by him. Proof is fuller attack testing from the PC against his own network only; upkeep is a monthly 15-minute review. Round 3 adds: a research ticket chooses between the July Tailscale and Remote Desktop set-up and the router's own VPN, then one Field guide covers the PC, laptop, both phones and Kirsty's phone; the Everlight work laptop is reached only on a route Everlight IT sanctions (`[claude]` flag, not reopened); and his grandad's PC clean-up (compromised in October) is confirmed step by step.

## 2. His kit and constraints

- **Broadband:** 4th Utility FTTP, £37.00 a month, commitment ends May 2027 (review March 2027, `fin.15`). Today the 4th Utility router sits in front of the ASUS: double NAT, both broadcasting Wi-Fi, wired router to router only.
- **Router:** ASUS RT-AX86U (the original, not the Pro), already on Asuswrt-Merlin; admin passwords changed and firmware current by his account; WPS, remote admin and UPnP state unknown.
- **Switches:** "a couple" of managed switches, currently unused; make and model not recorded.
- **Devices:** 20 to 40. Cameras or a video doorbell; plugs, bulbs, sensors; Alexa; TVs and streaming sticks (LG, Samsung, Sky Glass, a Fire Stick per the 26 November blocking chat); iPhone 17 Pro, Pixel, the main PC (Windows, Pro edition per the office harvest, Hyper-V on), a laptop, Kirsty's phone, the Everlight work laptop on the same Wi-Fi as everything else today.
- **Home Assistant and the always-on box:** ticketed under Substrate (`sub.03` builds the box, `sub.06` the DNS filter, `sub.07` the VPN, `sub.09` network monitoring).
- **Budget:** up to £100 for kit, nothing bought before Phil sees a costed list.

## 3. What the research found

### 3.1 Four networks on a plain RT-AX86U: the firmware line matters

- The current Merlin build for the RT-AX86U is **3004.388.13** on the stable 388 branch (Merlin download table, checked 2026-11-28; the changelog entry is dated 7 November 2026 per a search summary, UNVERIFIED against the page itself) [3]. The 388 branch is described as the branch for "legacy devices still on the 388 code branch" [3]. No end-of-support date for the RT-AX86U on Merlin was found; the 386 branch was given an end date (end of 2024) a year ahead, so expect a similar notice (UNVERIFIED) [3].
- **ASUS's VLAN and Guest Network Pro features need firmware 3.0.0.6.102 or later and the supported-model list names the RT-AX86U Pro, not the plain RT-AX86U** [2]. Forum users state the plain RT-AX86U does not get 3006 firmware or its Guest Network Pro and VLAN pages [2][5]. So on Phil's router there is **no VLAN page and no IoT network profile** in the web interface.
- What 3004.388 does have: the main network plus up to three guest networks per band. With "Access Intranet" off, **Guest Network 1 gets its own subnet** (introduced for AiMesh), while Guest Networks 2 and 3 are isolated from the main LAN by firewall rules [5]. Reports conflict: some see Guest 1 clients with no DNS until a setting is changed, some see guests still reaching shares (UNVERIFIED either way; to be tested in `net.07` and `net.23`) [5].
- **YazFi** (the long-standing Merlin add-on that gave each guest network its own subnet, client isolation, one-way or two-way access to the LAN and DNS forcing) was **archived by its owner on 22 March 2026**; last release v4.4.4, September 2023 [1]. It may still run on 388 but gets no fixes. Treat it as a fallback, not the plan.
- **Wired VLANs to the managed switches** need community scripts on 3004 firmware: there is "no script to create arbitrary VLANs with the 388 firmware, but there is a script to create a single VLAN guest network" [6]; older multi-VLAN scripts (Jimmy-Z gist) were written for the AC86U and assume the router is in access point mode behind another router [7]. Port-to-interface maps differ by model (the AX86U WAN is eth0, not eth4 as some scripts assume) [7]. A script that builds bridges for guest networks is reported as tested on the RT-AX86U but conflicts with other isolation scripts (forum page refused fetch; UNVERIFIED) [6].
- **Consequence for the design:** a Wi-Fi-only four-network layout (main = Trusted; Guest 1 = Smart devices with its own subnet; Guest 2 = Work; Guest 3 = Guests) is reachable with the stock 388 GUI. Wired smart devices (TVs, a Sky Glass on Ethernet, the Substrate box) cannot be put on a separate network without either a scripted VLAN or a different routing device. Smart plugs and many cameras are 2.4 GHz only, so the Smart devices SSID needs a 2.4 GHz guest slot.
- Options `net.05` should cost and compare (none decided here): (a) stock 388 guest networks, Wi-Fi only, wired devices stay on Trusted or move to Wi-Fi; (b) add a single-VLAN script for one wired network on a managed switch; (c) replace the router with a model on 3006 firmware that has Guest Network Pro and VLAN pages (the RT-AX86U Pro is on the supported list [2]; price to be found, likely over the £100 cap); (d) let the Substrate box route the networks (a firewall distribution on the box with the ASUS as an access point), which moves risk onto a box that does not yet exist.

### 3.2 Making the ASUS the only router (4th Utility)

- 4th Utility's own help page: **"Yes, of course you can"** use your own router; tell them first. They supply a **Bridge** free of charge where the fibre terminates; your router plugs into its Ethernet port and connects by **PPPoE**, with the username and password under **Service Info** in the online account [16].
- Their warning, in their words: follow the steps only when ready to switch, because **you "cannot pre-configure your set-up and then go back"** to the supplied router [16]. That is a lock-out risk: the house is offline until the ASUS's PPPoE login works.
- The page gives no VLAN id and nothing on IPv6 [16]. A forum user with an Icotera i5205-00 bridge on 4th Utility reports the PPPoE credentials changed depending on which device was in use (anecdotal) [17].
- Merlin handles PPPoE on the WAN port natively (general knowledge, not separately sourced).
- This fits the broadband review (`fin.15`, 2027-03-01): asking 4th Utility for the Bridge, confirming the credentials and any VLAN, and doing the swap are cheap to bundle with that call.

### 3.3 The DNS filter: on the router, on a box, or hosted

- **AdGuard Home on the router:** the Asuswrt-Merlin AdGuard Home installer (AMAGHI) supports ARM ASUS routers on Merlin with JFFS; the RT-AX86U qualifies [8]. Forum reports say it uses less memory than **Diversion** but answers slightly slower; running both is discouraged [9]. Reliability reports are mixed (a frozen web page after install, one stuck update) [8][9]. It needs a USB drive or JFFS space and is lost on a factory reset.
- **Merlin DNS Director** forces clients (globally or per device) to a chosen resolver, which is how a filter on any box is made unavoidable for plain DNS; since 3004.388.10 a Custom DNS entry is needed when redirecting to an address given out by DHCP, and the guest networks behave differently depending on "Access Intranet" [15]. Blocking port 53 alone does not stop devices with hard-coded encrypted DNS [15].
- **Per-person profiles** (Phil, Kirsty unfiltered for news, guests, a future child) are native in AdGuard Home (per-client settings, blocked services and schedules) [19] and in the hosted services (see `dossiers/block.md`). Pi-hole does it with groups.
- **Block page with "open anyway" over HTTPS:** every DNS filter has the same wall: a DNS answer cannot show a page for an HTTPS site without a trusted certificate on each device; this is the decisive constraint for `block.05` and is set out in `dossiers/block.md` §3.1.
- The 26 November guide (NextDNS denylist, soft hide, 26 steps) is input, not plan (H10). Its NextDNS facts (free tier 300,000 queries a month, Pro about US$1.99 a month or US$19.90 a year) still stand per current reviews [block dossier].
- Recommendation for `net.03` to test, not a decision: router-hosted AdGuard Home is the cheapest start and needs no new box, but `sub.06` already plans the filter on Substrate; a hosted service is the only one of the three that also covers the phones away from home without the VPN.

### 3.4 Remote access

- **Router VPN:** the RT-AX86U on 388 firmware has **WireGuard server and client built in** (ASUS support page lists both) plus Merlin's own OpenVPN server [13]. One 2026 report describes asymmetric routing and dropped packets when the WireGuard and OpenVPN servers run alongside VPN Director on 3004.388.12_2 (single report) [14]. A router VPN needs a reachable public address: **behind today's double NAT it cannot work** until the ASUS is the only router or a port is forwarded through the 4th Utility router.
- **Tailscale:** the Personal plan is free, allows **six users**, unlimited user devices and **50 tagged resources**, and includes subnet routers and exit nodes on every plan (Tailscale pricing FAQ and April 2026 pricing post) [11][12][18]. It works through double NAT because every connection is outbound. Merlin's wiki documents installing Tailscale through Entware on the router itself and warns against updating it from Tailscale's own site [10]; a subnet router on the router (or on the Substrate box) would let the phones reach the cameras without a client on each camera.
- July's set-up (Tailscale on the PC and laptop, Remote Desktop to the PC's tailnet name, Windows Pro host, NLA on, never port-forward 3389) still fits these facts. Kirsty's phone would be one of the six users or a device under Phil's user.
- **Work laptop:** Everlight's own VPN is a different question (H2.14 flag): `net.22` is written for the sanctioned route only.

### 3.5 The audit and scans

- What to look at on each router: WPS (off), remote web admin from the WAN (off), UPnP (off unless a named device needs it), port forwards, DMZ, the router's own SSH and web access ports, firmware version, and on Merlin the AiCloud service, which **Merlin removed in 388.11 for its security record** [3].
- The outside scan must come from outside the house (a phone hotspot, or a hosted scanner aimed only at Phil's own public address) to see what the internet sees; a scan from the PC sees the inside. Behind double NAT, the scan sees the 4th Utility router only.

### 3.6 Grandad's PC (H10 fold)

- Not Phil's network; a Field guide to confirm three things: the clean reinstall finished (fresh Windows install date shown in Settings, System, About), passwords changed from another device, and his router checked (admin password, remote admin, firmware, DNS settings not tampered with, which is a common trick of proxy malware: general knowledge, not sourced).

## 4. Risks

| Risk | Mitigation carried by the tickets |
|---|---|
| **Lock-out from the internet** when the 4th Utility router is swapped for the Bridge (cannot pre-configure and go back) | `net.02` is research only; the swap is not ticketed in this run. The research asks for the PPPoE credentials and any VLAN in writing first and puts the swap on a weekday evening with the 4th Utility router kept boxed. |
| **Lock-out from the router** while building networks (a wrong firewall or DNS Director rule) | `net.06` takes a dated config backup before every change and records the rollback; `net.07` is one network per sitting with a check after each; the main network is changed last. |
| **Kirsty-facing breakage** (TV, Alexa, doorbell offline after a move) | `net.09` is one room per sitting with a "put it back" line; `net.20` gives Kirsty the simple-mode switch and card before any device moves; `block.02` asks her before any TV change. |
| **Work laptop and patient data** | `net.08` isolates only; `net.22` uses Everlight's sanctioned route only (flag kept). |
| **Scanning the wrong target** | `net.01` and `net.23` say "Phil's own public address and own devices only"; the address is confirmed from the router page in the same sitting. |
| **Money** (switches, a replacement router) | `net.11` is a costed list; nothing is bought. A 3006-capable router is named as an option with a price to be found. |
| **YazFi archived** | Not used by default; the stock 388 guest networks are tried first. |

## 5. Facts that differ from the plan

- **net.05 and net.07** say "VLANs" and "which managed switch goes where". The plain RT-AX86U on 3004.388 has no VLAN or Guest Network Pro page; those need the RT-AX86U Pro or another 3006 model [2]. Four Wi-Fi networks are possible with the stock guest networks; wired separation needs a community script [6][7] or another routing device. The tickets are written as "design the four networks within what 388 offers, and price the options for wired separation"; the integrator may want to reword the plan titles.
- **E.net epic title** ("four networks on the RT-AX86U") holds only for Wi-Fi devices on today's firmware; see above.
- **net.04 / net.21:** the router's own VPN cannot accept connections while the 4th Utility router sits in front (double NAT). So net.04's choice depends on net.02, which the plan does not show. `net.04` names net.02 in its Depends on for the router-VPN branch only, without a hard dependency, because Tailscale works either way.
- **net.03** says it "blocks block.03 and sub.06"; the plan's dependency for block.03 is `after net.03` only. If net.03 chooses Substrate, block.03 also waits on sub.06 (the cross-epic order in §25 already shows this). Kept as in the plan, noted on the ticket.
- **net.13** (TV tracking) is `after net.12` in the plan; the shared TVs are Kirsty's too, and section 9 answer 17 says technical TV tickets wait on asking her, so the ticket adds `after block.02`.
- **net.25** (grandad's PC) has no dependency and P only; it may need Phil to visit or phone, which the plan does not say. Kept.
- Question for Phil (lock-out risk, not decided here): whether the 4th Utility swap to the Bridge is done before or after the broadband review on 2027-03-01, since a provider change in May 2027 would undo it.

## 6. Sources

1. https://github.com/jackyaz/YazFi : YazFi, README and archive notice (checked 2026-11-28)
2. https://www.asus.com/uk/support/FAQ/1049415 : ASUS, "What is VLAN and how to set up in ASUS Wireless Router?" (supported models, firmware 3.0.0.6.102 and later) (checked 2026-11-28)
3. https://www.asuswrt-merlin.net/ : Asuswrt-Merlin home, download table and changelog (RT-AX86U 3004.388.13; AiCloud removed in 388.11) (checked 2026-11-28)
4. https://www.sourceforge.net/projects/asuswrt-merlin/files/RT-AX86U/Release : Merlin RT-AX86U release files (listing showed 388.11, likely stale) (checked 2026-11-28)
5. https://www.snbforums.com/threads/disabling-access-intranet-on-rt-ax86u-guest-network-causes-iot-devices-on-primary-network-to-repeatedly-disconnect.86928 : SNBForums, RT-AX86U guest network and Access Intranet (checked 2026-11-28)
6. https://www.snbforums.com/threads/script-to-enable-vlan-on-rt-ax86u-pro-and-current-merlin-firmware.93346/ : SNBForums, VLAN scripts on current Merlin (checked 2026-11-28)
7. https://gist.github.com/Jimmy-Z/6120988090b9696c420385e7e42c64c4 : multi-SSID VLAN script for the AC86U on Merlin (checked 2026-11-28)
8. https://www.github.com/jumpsmm7/Asuswrt-Merlin-AdGuardHome-Installer : Asuswrt-Merlin AdGuard Home installer (checked 2026-11-28)
9. https://www.snbforums.com/threads/adguardhome-memory-usage-analysis.78378/ : SNBForums, AdGuard Home and Diversion memory on an RT-AX86U (checked 2026-11-28)
10. https://github.com/RMerl/asuswrt-merlin.ng/wiki : Merlin wiki, "Installing Tailscale through Entware" (checked 2026-11-28)
11. https://tailscale.com/blog/pricing-v4 : Tailscale, April 2026 pricing post (six users on Personal) (checked 2026-11-28)
12. https://tailscale.com/docs/reference/faq/pricing : Tailscale pricing FAQ (user devices, tagged resources) (checked 2026-11-28)
13. https://www.asus.com/us/supportonly/rtax86u/helpdesk_bios : ASUS RT-AX86U support page (WireGuard server and client) (checked 2026-11-28)
14. https://www.snbforums.com/threads/problem-with-openvpn-and-or-wg-when-activate-client-and-server.98047/ : SNBForums, VPN servers and VPN Director on 3004.388.12_2 (checked 2026-11-28)
15. https://snbforums.com/threads/guest-networks-and-dns-director.94387 : SNBForums, guest networks and DNS Director (checked 2026-11-28)
16. https://4thutility.co.uk/contact/broadband/can-i-supply-my-own-router : 4th Utility, "Can I supply my own router?" (checked 2026-11-28)
17. https://forum.netduma.com/topic/61083-xr1000v2-with-fibre-isp-4th-utility-uk-icotera-i5205-00-bridge-device-issues/ : Netduma forum, a third-party router on the 4th Utility Icotera bridge (checked 2026-11-28)
18. https://tailscale.com/docs/features/subnet-routers : Tailscale, subnet routers (checked 2026-11-28)
19. https://adguard-dns.io/kb/adguard-home/clients/ : AdGuard Home, per-client settings (checked 2026-11-28)
