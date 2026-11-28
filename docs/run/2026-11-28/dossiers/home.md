# Dossier: E.home, the room editor, then the bathroom and the nursery (HOME)

*Written 2026-11-28 by a T2 dossier agent from plan §10, the digest `digests/home-3d-rooms.md` and the harvest summary in `Project Exports/harvest-chats-outside-projects.md` (the bathroom, 3D model and Bosch round entries). Web facts carry their checked date.*

## 1. What Phil decided

Phil wants his own web viewer in Mycelium for good-looking renders of finished rooms, the technical record and trying layouts to scale: simple, to scale, quick to change, on the phone and the PC. The editor is built first and room decisions wait for it (flagged once, not reopened). It must place and move furniture to scale as sized labelled boxes, change wall and floor colours, save two or three layouts per room, and offer standing, seated, child-height and walk-through viewpoints; lighting is positions only, later turned into Home Assistant scenes. Kirsty leads the look through two or three mood boards per room, each with a hero piece the room budget protects; Phil does nearly everything himself, with a learn-it-or-hire-it ticket for plastering, tiling, flooring and electrics beyond swapping fittings. One room at a time: bathroom, nursery (the smallest bedroom), bedroom, living room, office. A budget per room from the "home" pot before designing; shopping lists feed the household budget. The whole house is measured first; Floorplanner's FML is imported once as the fallback; everything moves into Mycelium, furniture-only inventory for now; the schema keeps room for a second property. The bathroom is folded in and is the first room. Done means the nursery is designed in the editor, bought and finished before June 2027. Kirsty's indoor plants get a placement adviser.

## 2. His kit and constraints

- **Mycelium**: Next.js 15 on Vercel Hobby with Supabase; a new Home section. The repo's AGENTS.md requires reading the bundled Next.js docs before any code.
- **Measurement and models**: every room was scanned in RoomScan Pro and exported (IFC, DXF, XML, Sweet Home 3D, Excel), then the subscription was cancelled. Floorplanner holds the corrected working model (doors and windows at the right sizes) and its FML export is "the only right geometry". Agreed tolerance: 2 cm per room, 5 cm house-wide. A Bosch UniversalDistance 40C laser was bought in October 2026; the wall-by-wall page was dropped because it did not work on his phone. The dollhouse viewer's floor-to-floor height is a placeholder until the stair risers are counted. The phone is an iPhone 17 Pro (LiDAR).
- **Bathroom state** (harvest, last touched 2026-11-25): a Nuie Ceramica P-shaped 1700 left-hand shower bath with reinforced base is ordered (Plumbworld via B&Q); recess 1700; concrete floor; walls stripped to brick for mould and rot. Shower pipes run through the existing wall cavity, not behind tiles; a thermostatic deck-mounted mixer. Boards are NoMorePly 12 mm, 1200 by 800; two were wasted with a Stanley knife; cutting is now with a diamond blade and a batten guide held by two clamps. Boards first; battens only after the bath is dry-fitted and level. Tanking slurry is not to go on the brick first. The new board overlaps behind the tile-retained strip. A click-clack waste kit is bought; spare white wall tiles are in the loft. A receipt showed the wrong insulation board. Moisture tests are in the job checklist.
- **The bathroom's plan documents** (plan tool, shopping list, job checklist, prep guide, measurements) are Claude artifacts and chats, not repo files.
- **Home Assistant** is not running yet (sub.08).
- **Phil's sittings** are 15 minutes.

## 3. What the research found

### 3.1 A minimal to-scale box editor in the browser

- **Prior art worth reading before designing.** Pascal Editor is an open-source 3D building editor on React Three Fiber with wall drawing, furniture placement and floor slabs [1]. openPlan3D is an open-source 2D/3D floor plan editor (SvelteKit and Three.js) with drag-and-drop placement, rotation, resizing and snapping and a 3D preview [2]. Both show the shape a minimal editor takes: a 2D plan for drawing and placing, a 3D view for looking, one shared model underneath.
- **What "minimal" means here.** From Phil's must-haves: rooms as wall outlines with openings, all in millimetres; items as boxes (name, width, depth, height, position, rotation); a layout as a named set of item placements per room; per-wall and per-floor colours; viewpoints as stored camera positions and eye heights; a walk-through as a path of points. No textures, no lighting simulation, no real models at first.
- **The phone problem.** Camera controls and object dragging fight over the same touch. The standard fix is to switch the camera control off while an object is being dragged (TransformControls' "dragging-changed" event toggles OrbitControls), and drei pairs TransformControls with an OrbitControls marked as the default control [3]. On mobile, users report touch events conflicting between OrbitControls, DragControls and TransformControls, with some patching three.js to stop it [4]; and touch on closely spaced meshes registering badly [5]. OrbitControls' touch mapping (one finger rotate, two fingers zoom and pan) has been asked to be made configurable [6]. Design consequence for home.01 and home.03: a select-then-move rule on the phone (tap to select; one finger moves the selected box on the floor plane; two fingers move the camera), and testing on a real phone, because this is the least documented part.
- All of this is design input; no framework detail is decided here (AGENTS.md: read the bundled Next.js docs first).

### 3.2 Floorplanner FML

- Floorplanner describes FML as a JSON format for floorplans covering walls, doors, windows, labels, lines, areas and objects with colours and materials; it publishes the standard with documentation and code samples and a licence that permits free use under conditions on a separate licence page [7]. Its v3.0 specification page says JSON is becoming the primary format while XML is still supported, and describes the floorplan object (walls, doors, windows, furniture; areas generated when walls enclose a space) [8] (page snippet only; the page refused a direct fetch: UNVERIFIED in detail). An older Ruby gem parses FML as XML, so older exports may be XML [9]. Practical rule for home.05: look at the file's first character (a brace means JSON, an angle bracket means XML) and parse against the published spec. An open-source FML importer for Blender (fml2blender) is mentioned on the Sweet Home 3D forum [10] as a second reference.
- **Can Phil export it?** Floorplanner's project levels page says upgrading a project unlocks sharing the plan as an .FML file, and Pro projects start at Level 2 [11]; a third-party help page says the export with the FML needs a Level 2 project [12]. Whether Phil's project is at that level is unknown: home.05 checks first and nothing is bought.
- **Units.** Floorplanner's page does not state FML's units: UNVERIFIED; check against a known room on import (home.05's three-room check).

### 3.3 The bathroom boards (NoMorePly)

- NoMorePly 12 mm is a **fibre cement** tile backer and construction board, sold as highly water resistant and non-combustible [13][14], not an insulation board. NoMorePly also sells a separate XPS insulation board [15]. This matters for home.12: the "wrong insulation board" on the receipt may be the XPS product, or simply a mislabelled line.
- **Cutting.** The maker's data sheet describes scoring one face with its tool and snapping over a block, with tile nippers for curves (summarised in search results from the data sheet; the PDF itself returned 404 on fetch: UNVERIFIED in full). Phil's method (diamond blade and clamped guide) is a power-tool cut of a silica-containing material. HSE's guidance for silica dust: on-tool extraction (H or M class) where possible, and RPE as a backup at FFP3 or a P3 half mask, fit-tested [16][17]. The tickets say cut outside, extraction if fitted, FFP3 and glasses.
- **Fixing.** The installation guide and data sheet give about nine 38 mm fibre cement screws per 1200 by 800 board, holding the board still while the PU adhesive cures; the board accepts direct fixings [18] (guide PDF refused a direct fetch; figures from search result summaries: UNVERIFIED in full). The lifetime guarantee needs the guide's procedure and the maker's named essentials. The ticket's phase 2 has Phil read the guide's masonry method before the first fix.
- **Tanking.** BS 5385-1:2018 is reported to recommend waterproofing domestic wet areas with a tanking membrane, liquid tanking or a waterproof backer board (clause number UNVERIFIED) [19]. Retailers describe NoMorePly as water resistant, not waterproof; a UK tiling forum suggests taping and tanking the joints at least [20]. The tickets tank the boards in the bath and shower zone in two coats, joints and corners taped, as the chosen kit says. Tanking on the boards, not the brick, matches Phil's note.
- **Moisture testing.** No published pass mark for brick before boarding was found. Building Conservation covers moisture measurement in masonry and why meter readings there are only a relative guide [21] (page not opened: UNVERIFIED summary); the practical method is a meter in masonry mode compared against a dry reference wall, and waiting if a wall reads clearly higher. UNVERIFIED as a numeric threshold; the ticket says so.
- **Substrate rules.** BS 5385 (as quoted by a tiling guide) says gypsum plasterboard should not be used for direct tiling in wet areas, and wood-based boards should not be tiled directly on walls [22].

### 3.4 Lighting, plants, inventory

- No research needed for positions-only lighting; Home Assistant scenes wait for sub.08.
- The plant adviser needs window orientation per room (from the model), and later temperature and humidity sensors through Home Assistant. No source checked: design detail for home.25.

### 3.5 Measuring

- Stair risers: counting risers and measuring one, checked against the full rise, gives floor-to-floor height (standard practice; no source needed). The Bosch round decision compares three rooms against the 2 cm tolerance already agreed.

### 3.6 Learn it or hire it: electrics

- In England, a new circuit, a new consumer unit, and circuit alteration or addition in a bathroom (around the bath or shower) are notifiable under Part P; DIY or unregistered work must be notified to building control before it starts, with a fee and an inspection; a registered electrician can self-certify [23][24]. Like-for-like replacement of a light fitting in zone 2 is not notifiable [25]. Sources are not fully consistent on scope, and the Planning Portal advises asking building control when unsure [24].

## 4. Risks

- **Silica dust from cutting boards** (health). Mitigation: home.13 cuts outside with FFP3 and glasses and extraction where the tool has it; a security note on every cutting step.
- **Boarding damp brick** (mould returns, money lost). Mitigation: home.13 phase 1 moisture test against a dry reference, and wait a week if high.
- **Cutting boards that should be returned** (money). Mitigation: home.12 settles the receipt before any cut; the step warns a cut board cannot normally be returned.
- **Tanking or sealing in the wrong order** (leaks). Mitigation: home.14 dry-fits the bath, then battens, then tanks, fixes the bath, fills it before sealing. Tanking steps and silicone are marked irreversible.
- **The detailed bathroom plan is not in the repo** (steps left out, double buying). Mitigation: home.14 phase 1 waits on rescue.01 and ticks the shopping list first.
- **Notifiable electrical work done without notice** (legal, safety, insurance). Mitigation: home.23 states the Part P rule before any bathroom or new-circuit work.
- **The editor not ready for the nursery** (Kirsty-facing; June date). Mitigation: none chosen here; the date lives on baby.15 and the stopgap is plan §27 point 5 for the red team.
- **Losing the corrected Floorplanner geometry** (data loss: the scans would need redoing). Mitigation: home.05 keeps the original FML untouched in the archive; the import is one-way.
- **Tall nursery furniture tipping** (child safety). Mitigation: home.18 anchors tall furniture with anti-tip kits.

## 5. Facts that differ from the plan

- **home.12 (title "insulation-board receipt mismatch")**: the boards in the plan are NoMorePly 12 mm fibre cement backer boards, not insulation boards. The receipt mismatch may be the maker's XPS insulation board appearing instead. The ticket keeps the plan's title and explains this.
- **home.14 (plan note "the rundown agent splits this from the plan it finds")**: no bathroom plan is in the repo. The detailed plan, shopping list, job checklist, prep guide and measurements live in Claude chats and artifacts ("Fixing a moving bathtub base", "Cutting boards: blade selection", "Bathroom board level cut", and the plan tool, shopping list and job checklist artifacts, per the harvest file). They must come through rescue.01. home.14 is written as one ticket with phases for the known steps and `after rescue.01` added. Note for the integrator: the harvest file lists these as chats outside projects, which is rescue.04's scope (its first five include "Home 3D model and inventory"), so rescue.01 or rescue.04 should name the bathroom documents explicitly.
- **home.13**: the maker's documented cut is score and snap; Phil's diamond-blade method is fine but needs silica dust controls (HSE), which the plan line does not mention.
- **home.05**: FML is JSON by the maker's current description (XML for older files), and exporting FML may need a Level 2 project (paid credits). The plan line assumes the export exists.
- **home.17 and home.18 ("dated through baby.15 / baby.22")**: written with no due date of their own, the date named in the description. If the integrator wants the dates on the home tickets as well, they are 2027-03-14 and 2027-04-25.
- **home.23**: Part P makes some of this work illegal to do without notifying building control first; "learn it" is not a free choice for a new circuit or anything in the bathroom zones.

## 6. Sources

1. https://raw.githubusercontent.com/pascalorg/editor/main/README.md, Pascal Editor README (checked 2026-11-28)
2. https://github.com/laanlabs/openPlan3D, openPlan3D (checked 2026-11-28)
3. https://drei.docs.pmnd.rs/gizmos/transform-controls, drei TransformControls (checked 2026-11-28)
4. https://discourse.threejs.org/t/orbit-controls-suppress-touch-events-on-mobile/15795, three.js forum: Orbit Controls suppress touch events on mobile (checked 2026-11-28)
5. https://discourse.threejs.org/t/mobile-devices-and-dragcontrols/14461, three.js forum: Mobile devices and DragControls (checked 2026-11-28)
6. https://github.com/mrdoob/three.js/issues/25977, three.js issue: OrbitControls touch mapping (checked 2026-11-28)
7. https://floorplanner.com/fml, Floorplanner: FML (checked 2026-11-28)
8. https://floorplanner.readme.io/reference/v30-specification, FML v3.0 specification (search snippet only; fetch refused) (checked 2026-11-28)
9. https://www.rubydoc.info/gems/floorplanner-fml/0.2.1/index, floorplanner-fml Ruby gem (checked 2026-11-28)
10. https://www.sweethome3d.com/support/forum/viewthread_thread,13772_lastpage,yes, Sweet Home 3D forum thread on FML (checked 2026-11-28)
11. https://floorplanner.com/project-levels, Floorplanner: project levels (checked 2026-11-28)
12. https://methodique.tawk.help/article/how-to-export-your-floorplanner-project, How to export your Floorplanner project (third party, about four years old) (checked 2026-11-28)
13. https://www.toolstation.com/nomoreply-12mm-fibre-cement-construction-board-pack-of-45/pAD834, Toolstation: NoMorePly 12 mm fibre cement board (checked 2026-11-28)
14. https://www.tilemountain.co.uk/no-more-ply-12mm-wall-tile-backer-boards, Tile Mountain: No More Ply 12 mm wall tile backer board (checked 2026-11-28)
15. https://www.toolstation.com/nomoreply-125mm-xps-insulation-board-pack-of-10/pAD835, Toolstation: NoMorePly XPS insulation board (checked 2026-11-28)
16. https://hse.gov.uk/construction/faq-dust.htm, HSE: construction dust FAQ (checked 2026-11-28)
17. https://www.hse.gov.uk/Construction/healthrisks/hazardous-substances/scabbling-or-grinding.htm, HSE: scabbling or grinding (checked 2026-11-28)
18. https://pureadhesion.co.uk/content/No More Ply Installation Guide.pdf, No More Ply installation guide (fetch refused; search summary) (checked 2026-11-28)
19. https://egor-rubber.sayu.co.uk/info/tanking-a-tiled-bathroom-is-now-mandatory, tile supplier blog on BS 5385-1:2018 tanking (checked 2026-11-28)
20. https://tilersforums.com/posts/977043, UK tilers forum on boards and tanking joints (checked 2026-11-28)
21. https://buildingconservation.com/articles/moisture-measurement/moisture.html, Building Conservation: measuring moisture in masonry (checked 2026-11-28)
22. https://www.tiles.org.uk/wp-content/uploads/flipbook/6/files/basic-html/page24.html, Tile Association tiling guide page citing BS 5385 (checked 2026-11-28)
23. https://trustedtraders.which.co.uk/articles/electrical-installation-regulations-don-t-get-left-with-unregistered-electrical-work/, Which? Trusted Traders: electrical installation regulations (checked 2026-11-28)
24. https://www.planningportal.co.uk/permission/common-projects/electrics/building-regulations-general-information, Planning Portal: electrics (checked 2026-11-28)
25. https://electrical.theiet.org/bs-7671/building-regulations/part-p-england-and-wales/frequently-asked-questions/, IET: Part P FAQ (checked 2026-11-28)
