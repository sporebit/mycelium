import type { FuelSummary, Station } from "./types";

function avgOf(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function aggregate(stations: Station[]): FuelSummary {
  const e10Stations = stations.filter(
    (s): s is Station & { e10: number } => s.e10 !== null
  );
  const b7Stations = stations.filter(
    (s): s is Station & { b7: number } => s.b7 !== null
  );

  const avgE10 = avgOf(e10Stations.map((s) => s.e10));
  const avgB7 = avgOf(b7Stations.map((s) => s.b7));

  let cheapestE10: { station: Station; price: number } | null = null;
  for (const s of e10Stations) {
    if (!cheapestE10 || s.e10 < cheapestE10.price) {
      cheapestE10 = { station: s, price: s.e10 };
    }
  }

  let cheapestB7: { station: Station; price: number } | null = null;
  for (const s of b7Stations) {
    if (!cheapestB7 || s.b7 < cheapestB7.price) {
      cheapestB7 = { station: s, price: s.b7 };
    }
  }

  return {
    avgE10,
    avgB7,
    cheapestE10,
    cheapestB7,
    stationCount: stations.length,
  };
}
