# Digest: Home network security (project SEC)
Brief sections: Section 2, 2b, H2 items 13 and 14, H10 Network (section 2) folded item. Source A:\Projects\Mycelium\docs\intake\intake-2026-11-27.md. Dashes in quoted answers are the brief's own.

## 1. First answers

### Section 2: Home network security (project SEC) (brief lines 48-77)

1. Topology today: **ASUS behind the 4th Utility router** (both routing, double NAT).
2. The ASUS is an **RT-AX86U**.
3. Worries, all four: **entry from the internet, a smart device taken over and reaching the PC, work data exposed, devices sending data home**.
4. **20 to 40** devices.
5. Device kinds, all four: **cameras or a video doorbell; plugs, bulbs, sensors; voice assistants; TVs and streaming sticks**.
6. Ecosystems: **Alexa** and **"iphone"** (read as Apple Home / iPhone apps, confirm when picked up).
7. The Everlight work machine is on **the same Wi-Fi as everything else**.
8. Target layout: **four networks**, Trusted, Work, Smart devices, Guests.
9. Firmware: **already on Asuswrt-Merlin** ("I'm on merlin already").
10. Kit: **"I have a couple managed switches already - but up to £100"**.
11. DNS: **one network-wide filter** carrying both security blocklists and the topic 9 content blocking.
12. Where the filter runs: **decide in a research ticket** (router, always-on box, or hosted).
13. Remote access: **yes, through a VPN only**.
14. Open ports today: **not sure**, first ticket is an audit of both routers plus an outside scan.
15. **Both routers broadcast Wi-Fi.**
16. Wiring: **"router to router only"**; the managed switches are unused.
17. Basics: **admin passwords changed, firmware current**; WPS / remote admin state unknown.
18. ISP router: **make the ASUS the only router if 4th Utility allows it** (research ticket).
19. Guests: **guest network with a QR code**.
20. Kirsty's devices: **Trusted**, same as his; a child's network is a later ticket.
21. Unknown device joins: **push through Mycelium**, inside the interruption budget.
22. Device inventory: **in Mycelium**, beside the home inventory.
23. Smart devices and the internet: **block where the device still works**, else allow only its own cloud.
24. Home Assistant: **yes, ticketed under self-hosting**, linked here.
25. Cameras and a baby monitor: **local only, no cloud**; viewed over the VPN.
26. Scope: **network only**; device and account hardening as separate SEC tickets.
27. Proof: **fuller attack testing**, outside scan, cross-network tests, plus Claude Code running standard scanning tools from the PC against every device (his own network and devices only).
28. Records: **network diagram in Docs + dated config backups**.
29. Switches: **use them where they help separation**.
30. Upkeep: **monthly 15-minute recurring review ticket**.

## 2. Round 2 extras

### Section 2b: Home network, extras (brief lines 428-436)

- **Network names:** reveal nothing about him or the house.
- **2am test** (a camera sending gigabytes somewhere new): cut that device off, tell him in the morning.
- **Kirsty's fallback:** both a labelled "simple mode" switch and a printed card by the routers.
- **Bar:** "everything possible. I want ultimate security", then, asked which wins when it clashes with £100 of kit, invisible-to-Kirsty and the simple-mode switch: **the earlier answers hold; as strong as possible inside them**.
- **Employer policy:** not checked first, "isolate it and see".
- **Tripwires:** one on each network.
- **Unsupported devices:** a cull list with dates, and where possible **Claude applies the security update itself**.
- **TV tracking:** block only what breaks nothing.
- **Method:** settings as scripts in a git repo, applied by Claude Code, each change approved by him.

## 3. Round 3 corrections and additions (these win)

### H2 item 13: Remote access (brief lines 624)

13. **Remote access:** a research ticket in the network epic decides between the July Tailscale and Remote Desktop set-up and the router's own VPN, then one Field guide covers the PC, laptop, both phones and Kirsty's phone. Rule kept: port 3389 is never exposed.

### H2 item 14: Work laptop (brief lines 625)

14. **Work laptop:** Phil says remoting on to it "is fine". `[claude]` flagged once: the July advice was to use only a route Everlight IT sanctions because the laptop touches patient data; the ticket is written for the approved route only.

### H10 folded item: Network (section 2), grandad PC (brief lines 703)

- **Network (section 2):** his grandad's PC was found compromised in October (miners, a backdoor, a proxy, dating from July). The clean reinstall, the password changes from another device and the router check were started but never confirmed finished. A ticket to confirm each; it is not Phil's network but the same account-hygiene work.

## 4. Flags marked [claude] that touch this epic

- H2 item 14 (brief line 625): 14. **Work laptop:** Phil says remoting on to it "is fine". `[claude]` flagged once: the July advice was to use only a route Everlight IT sanctions because the laptop touches patient data; the ticket is written for the approved route only.

## 5. Assumed items

None.

## 6. Dates named for this epic

- Upkeep: a monthly 15-minute recurring review ticket (section 2 answer 30, brief line 77).
- Broadband (4th Utility) commitment ends May 2027; review and check the notice period in March 2027 (H2 item 4, line 615). It links to answer 18 (making the ASUS the only router depends on the provider).
- Grandad PC compromised in October, dating from July (H10, line 703).
- Remote access set-up referred to as the July Tailscale and Remote Desktop set-up (H2 item 13, line 624).

## 7. Cross-links to other epics

- sec-blocking: shares the network DNS filter (section 2 answer 11; section 9 rides on it).
- substrate-self-hosting: the DNS filter and VPN host, the first services on Substrate (section 7 answer 29); Home Assistant ticketed under self-hosting (section 2 answer 24).
- dashboard-wall: screens sit on the Smart-devices network, allowed to reach Mycelium and Home Assistant only (section 6 answer 27).
- baby: cameras and baby monitor local only, viewed over the VPN (section 2 answer 25).
- sec-keys-and-domains: remote-access and account-hygiene work overlaps (grandad PC, H10 line 703).
