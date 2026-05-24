import type { Station } from "./types";

// Approximate centre of Armthorpe (DN3), Doncaster.
export const ARMTHORPE_LAT = 53.5172;
export const ARMTHORPE_LNG = -1.0596;

const EARTH_RADIUS_MILES = 3958.8;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_MILES * c;
}

export function filterByDistance(
  stations: Station[],
  miles = 5,
  centreLat = ARMTHORPE_LAT,
  centreLng = ARMTHORPE_LNG
): Station[] {
  return stations
    .map((s) => ({
      ...s,
      distanceMiles: haversineMiles(centreLat, centreLng, s.lat, s.lng),
    }))
    .filter((s) => s.distanceMiles !== undefined && s.distanceMiles <= miles)
    .sort((a, b) => (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity));
}
