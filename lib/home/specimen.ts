/**
 * Specimens for the Specimen plate (claude/ui-direction.md): five species
 * drawn in code, ported from the Plate mock-up
 * (docs/design/home-views/Plate.dc.html) as the first pass.
 *
 * The artwork source is still Phil's choice (public-domain engravings or
 * generated artwork). Everything about how a specimen LOOKS is in this
 * file and in components/home/Specimen.tsx; the layout never reaches past
 * those two, so the artwork can be replaced without touching the plate.
 *
 * Pure and seeded: the same item always grows the same specimen.
 *
 * The SPECIES shapes below were copied once from the mock-up file. This is
 * now the source: edit it directly.
 */

export type Species = {
  name: string;
  /** Colour the cap floods with when its item is done. */
  cap: string;
  capD: string;
  underA: string;
  underB: string;
  stemD: string;
  ring: string;
  stria: string;
  /** [x from, x to, y top, y bottom, convergence] for the gill lines; null for a species with none. */
  gill: [number, number, number, number, number] | null;
  /** [x min, x max, y min, y max] of the cap, for hatching and stipple. */
  box: [number, number, number, number];
  /** [x, y, radius] of each spot on the cap. */
  spots: Array<[number, number, number]>;
  capLines: string;
};

export const SPECIES: readonly Species[] = [
  {
    "name": "Fly agaric",
    "cap": "#d9a441",
    "capD": "M22 190 C26 96 96 34 150 34 C204 34 274 96 278 190 C232 208 68 208 22 190 Z",
    "underA": "M22 190 C68 208 232 208 278 190 C240 228 60 228 22 190 Z",
    "underB": "",
    "stemD": "M132 372 C136 320 128 270 134 206 L166 206 C172 270 164 320 170 372 C158 382 144 382 132 372 Z",
    "ring": "M124 236 C140 250 160 250 176 236 C170 258 130 258 124 236 Z",
    "stria": "M144 212 C142 260 146 316 142 368 M156 212 C158 260 154 316 158 368 M150 214 C151 270 149 320 150 370",
    "gill": [
      40,
      260,
      200,
      224,
      0.3
    ],
    "box": [
      20,
      280,
      34,
      206
    ],
    "spots": [
      [
        96,
        112,
        11
      ],
      [
        150,
        78,
        9
      ],
      [
        198,
        118,
        12
      ],
      [
        128,
        150,
        7
      ],
      [
        232,
        160,
        8
      ],
      [
        62,
        160,
        7
      ]
    ],
    "capLines": ""
  },
  {
    "name": "Field mushroom",
    "cap": "#c9744a",
    "capD": "M8 196 C24 128 96 100 150 100 C204 100 276 128 292 196 C240 212 60 212 8 196 Z",
    "underA": "M8 196 C60 212 240 212 292 196 C250 232 50 232 8 196 Z",
    "underB": "",
    "stemD": "M126 372 C132 330 128 280 132 214 L168 214 C172 280 168 330 174 372 C160 382 140 382 126 372 Z",
    "ring": "",
    "stria": "M142 222 C140 270 144 320 140 368 M158 222 C160 270 156 320 160 368",
    "gill": [
      24,
      276,
      206,
      228,
      0.28
    ],
    "box": [
      8,
      292,
      100,
      212
    ],
    "spots": [
      [
        90,
        150,
        9
      ],
      [
        150,
        128,
        8
      ],
      [
        210,
        152,
        10
      ],
      [
        250,
        178,
        6
      ]
    ],
    "capLines": ""
  },
  {
    "name": "Liberty cap",
    "cap": "#9db88a",
    "capD": "M66 214 C72 120 118 36 150 24 C182 36 228 120 234 214 C204 228 96 228 66 214 Z",
    "underA": "M66 214 C96 228 204 228 234 214 C212 240 88 240 66 214 Z",
    "underB": "",
    "stemD": "M140 372 C142 330 139 290 142 226 L158 226 C161 290 158 330 160 372 C154 380 146 380 140 372 Z",
    "ring": "",
    "stria": "M147 232 C146 280 148 330 146 368 M153 232 C154 280 152 330 154 368",
    "gill": [
      78,
      222,
      222,
      238,
      0.3
    ],
    "box": [
      66,
      234,
      24,
      226
    ],
    "spots": [],
    "capLines": "M150 28 C146 90 140 160 132 220 M150 28 C154 90 160 160 168 220 M150 28 C132 90 110 160 96 218 M150 28 C168 90 190 160 204 218"
  },
  {
    "name": "Chanterelle",
    "cap": "#b08fb8",
    "capD": "M34 104 C90 128 210 128 266 104 C250 170 196 214 170 262 L130 262 C104 214 50 170 34 104 Z",
    "underA": "",
    "underB": "M34 104 C90 84 210 84 266 104 C210 128 90 128 34 104 Z",
    "stemD": "M130 262 C128 300 134 340 128 372 C142 382 158 382 172 372 C166 340 172 300 170 262 Z",
    "ring": "",
    "stria": "",
    "gill": [
      52,
      248,
      118,
      258,
      0.16
    ],
    "box": [
      34,
      266,
      104,
      262
    ],
    "spots": [],
    "capLines": ""
  },
  {
    "name": "Puffball",
    "cap": "#d8c9a0",
    "capD": "M64 250 C36 150 104 84 150 84 C196 84 264 150 236 250 C222 300 78 300 64 250 Z",
    "underA": "",
    "underB": "",
    "stemD": "M120 292 C118 330 124 356 116 372 C140 382 160 382 184 372 C176 356 182 330 180 292 Z",
    "ring": "",
    "stria": "",
    "gill": null,
    "box": [
      50,
      250,
      84,
      298
    ],
    "spots": [
      [
        100,
        130,
        6
      ],
      [
        130,
        108,
        5
      ],
      [
        165,
        104,
        6
      ],
      [
        198,
        128,
        6
      ],
      [
        220,
        165,
        5
      ],
      [
        84,
        170,
        5
      ],
      [
        112,
        160,
        4
      ],
      [
        150,
        140,
        5
      ],
      [
        185,
        160,
        4
      ],
      [
        205,
        200,
        5
      ],
      [
        96,
        210,
        5
      ],
      [
        140,
        190,
        4
      ],
      [
        170,
        200,
        4
      ]
    ],
    "capLines": ""
  }
];

/** The drawing box every specimen is drawn in. */
export const SPECIMEN_VIEWBOX = { width: 300, height: 440 } as const;

export type SpecimenPaths = {
  species: number;
  name: string;
  cap: string;
  capD: string;
  underA: string;
  underB: string;
  stemD: string;
  ring: string;
  stria: string;
  capLines: string;
  gills: string;
  hatch: string;
  stipple: string;
  spots: string;
  roots: string;
  ground: string;
};

/** A small seeded generator (mulberry32): the same seed gives the same numbers on the server and in the browser. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable number from a string (an item's id): the seed for its specimen. */
export function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Which species an item is: its own, from its seed, so a day's figures differ
 * (claude/ui-direction.md §6: "a different species per item"). The section is
 * taken but not used: most of a day's items share one project, and a plate
 * of five identical mushrooms says nothing. It stays in the signature so
 * the choice can change here without touching a view.
 */
export function speciesFor(_section: string | null | undefined, itemSeed: number): number {
  return (itemSeed >>> 0) % SPECIES.length;
}

/**
 * Every path of one specimen. `detail: false` leaves out the fine work
 * (hatching, stipple, gills, grass) for the small figures, where it would
 * only be noise.
 */
export function specimen(species: number, seed: number, opts: { detail?: boolean } = {}): SpecimenPaths {
  const K = SPECIES[((species % SPECIES.length) + SPECIES.length) % SPECIES.length];
  const detail = opts.detail !== false;
  const r = seeded(seed);
  const b = K.box;
  const hh = b[3] - b[2];

  let gills = "";
  if (detail && K.gill) {
    const g = K.gill;
    for (let x = g[0]; x <= g[1]; x += 8) gills += `M${x} ${g[2]}L${(150 + (x - 150) * g[4]).toFixed(0)} ${g[3]}`;
  }

  let hatch = "";
  let stipple = "";
  if (detail) {
    for (let c = 150 - hh * 0.3; c < b[1]; c += 7) hatch += `M${c.toFixed(0)} ${b[2]}l${(hh * 0.42).toFixed(0)} ${hh}`;
    for (let k = 0; k < 150; k++) {
      const x = b[0] + r() * (150 - b[0]) * 1.05;
      const y = b[2] + r() * hh;
      stipple += `M${x.toFixed(1)} ${y.toFixed(1)}h0.1`;
    }
  }

  let spots = "";
  for (const [x, y, q] of K.spots) spots += `M${x - q} ${y}a${q} ${q} 0 1 0 ${2 * q} 0a${q} ${q} 0 1 0 ${-2 * q} 0`;

  let roots = "";
  const walk = (x0: number, y0: number, a0: number, n: number, gen: number): void => {
    let x = x0;
    let y = y0;
    let a = a0;
    roots += `M${x.toFixed(1)} ${y.toFixed(1)}`;
    for (let i = 0; i < n; i++) {
      a += (r() - 0.5) * 0.7;
      x += Math.cos(a) * 11;
      y += Math.sin(a) * 9;
      roots += `L${x.toFixed(1)} ${Math.min(438, y).toFixed(1)}`;
      if (gen < 2 && r() < 0.3) {
        walk(x, y, a + (r() < 0.5 ? -0.8 : 0.8), Math.round(n * 0.6), gen + 1);
        // Carry on along the parent root after the side root.
        roots += `M${x.toFixed(1)} ${Math.min(438, y).toFixed(1)}`;
      }
    }
  };
  for (let k = 0; k < (detail ? 9 : 5); k++) walk(138 + r() * 24, 374, 0.25 + r() * 2.64, 6 + Math.round(r() * 7), 0);

  let ground = "M40 374H260";
  if (detail) for (let x = 46; x < 258; x += 9 + r() * 10) ground += `M${x.toFixed(0)} 374l${((r() - 0.5) * 6).toFixed(1)} ${(-5 - r() * 9).toFixed(1)}`;

  return {
    species: SPECIES.indexOf(K),
    name: K.name,
    cap: K.cap,
    capD: K.capD,
    underA: K.underA,
    underB: K.underB,
    stemD: K.stemD,
    ring: K.ring,
    stria: K.stria,
    capLines: K.capLines,
    gills,
    hatch,
    stipple,
    spots,
    roots,
    ground,
  };
}
