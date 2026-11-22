/**
 * PhirstMaxx engine — night-sky helpers: moon brightness and phase, sunset
 * and nautical dusk, and the 0–1 stargazing score the ranking reads.
 *
 * The old app took the sun and moon from the suncalc package, which this
 * repo does not have. The formulas below are the same low-precision
 * astronomy suncalc uses (after Astronomy Answers), good to a minute or two
 * for sunset and a percent or so for illumination, which is all a "clear
 * dark night?" check needs. Cloud cover arrives from the forecast elsewhere.
 */

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const J1970 = 2440588;
const J2000 = 2451545;
const OBLIQUITY = RAD * 23.4397;

export type SkyConditions = {
  /** 0–1 */
  moonIllumination: number;
  /** 0–100, null when there is no forecast. */
  cloudCoverPercent: number | null;
  sunset: number | null;
  /** When the sun is 12° below the horizon (nautical dusk). */
  darkBy: number | null;
};

const toDays = (instant: number) => instant / DAY_MS - 0.5 + J1970 - J2000;
const fromJulian = (j: number) => (j + 0.5 - J1970) * DAY_MS;

const declination = (l: number, b: number) =>
  Math.asin(Math.sin(b) * Math.cos(OBLIQUITY) + Math.cos(b) * Math.sin(OBLIQUITY) * Math.sin(l));
const rightAscension = (l: number, b: number) =>
  Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY) - Math.tan(b) * Math.sin(OBLIQUITY), Math.cos(l));

const solarMeanAnomaly = (d: number) => RAD * (357.5291 + 0.98560028 * d);

function eclipticLongitude(m: number): number {
  const centre = RAD * (1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m));
  return m + centre + RAD * 102.9372 + Math.PI;
}

function sunCoords(d: number) {
  const l = eclipticLongitude(solarMeanAnomaly(d));
  return { dec: declination(l, 0), ra: rightAscension(l, 0) };
}

function moonCoords(d: number) {
  const L = RAD * (218.316 + 13.176396 * d);
  const M = RAD * (134.963 + 13.064993 * d);
  const F = RAD * (93.272 + 13.22935 * d);
  const l = L + RAD * 6.289 * Math.sin(M);
  const b = RAD * 5.128 * Math.sin(F);
  return { ra: rightAscension(l, b), dec: declination(l, b), dist: 385001 - 20905 * Math.cos(M) };
}

function moon(instant: number): { fraction: number; phase: number } {
  const d = toDays(instant);
  const s = sunCoords(d);
  const m = moonCoords(d);
  const sunDist = 149598000;
  const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(sunDist * Math.sin(phi), m.dist - sunDist * Math.cos(phi));
  const angle = Math.atan2(
    Math.cos(s.dec) * Math.sin(s.ra - m.ra),
    Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra),
  );
  return { fraction: (1 + Math.cos(inc)) / 2, phase: 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / Math.PI };
}

/** Lit fraction of the moon, 0 (new) to 1 (full). */
export function moonIllumination(instant: number): number {
  return moon(instant).fraction;
}

/** Sunset and nautical dusk for the solar day around `instant`; null when the sun never gets there. */
export function sunTimes(instant: number, lat: number, lng: number): { sunset: number | null; darkBy: number | null } {
  const lw = RAD * -lng;
  const phi = RAD * lat;
  const d = toDays(instant);
  const n = Math.round(d - 0.0009 - lw / (2 * Math.PI));
  const ds = 0.0009 + lw / (2 * Math.PI) + n;
  const M = solarMeanAnomaly(ds);
  const L = eclipticLongitude(M);
  const dec = declination(L, 0);
  const setAt = (degrees: number): number | null => {
    const w = Math.acos((Math.sin(degrees * RAD) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));
    if (!Number.isFinite(w)) return null;
    const a = 0.0009 + (w + lw) / (2 * Math.PI) + n;
    return Math.round(fromJulian(J2000 + a + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L)));
  };
  return { sunset: setAt(-0.833), darkBy: setAt(-12) };
}

/**
 * 1 when it is clearly a stargazing night (little cloud, dim moon), tapering
 * to 0. Unknown cloud is treated as half-cloudy rather than clear.
 */
export function skyScore(cloudCoverPercent: number | null, moonFraction: number): number {
  const cloud = cloudCoverPercent ?? 50;
  const cloudTerm = cloud <= 30 ? 1 : cloud >= 80 ? 0 : 1 - (cloud - 30) / 50;
  const moonTerm = moonFraction <= 0.4 ? 1 : moonFraction >= 0.9 ? 0 : 1 - (moonFraction - 0.4) / 0.5;
  return Math.round(cloudTerm * moonTerm * 100) / 100;
}

export function moonPhaseLabel(instant: number): string {
  const p = moon(instant).phase;
  if (p < 0.03 || p > 0.97) return "New moon";
  if (p < 0.22) return "Waxing crescent";
  if (p < 0.28) return "First quarter";
  if (p < 0.47) return "Waxing gibbous";
  if (p < 0.53) return "Full moon";
  if (p < 0.72) return "Waning gibbous";
  if (p < 0.78) return "Last quarter";
  return "Waning crescent";
}
