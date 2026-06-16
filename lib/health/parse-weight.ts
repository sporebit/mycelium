export type ParsedWeight = {
  value_kg: number;
  original_value: number;
  original_unit: "kg" | "lbs" | "stone";
};

const WEIGHT_PATTERN =
  /\b(\d+(?:\.\d+)?)\s*(kg|kilos?|kgs?|lbs?|pounds?|stone|st)\b/i;

const WEIGHT_CONTEXT =
  /\b(weigh|weight|weighed|weighing|came in at|body\s?weight|scales?|on the scale|stepping on|i'?m|log weight|log my weight)\b/i;

export function parseWeight(text: string): ParsedWeight | null {
  const match = text.match(WEIGHT_PATTERN);
  if (!match) return null;

  if (!WEIGHT_CONTEXT.test(text) && !/^\s*\d+(?:\.\d+)?\s*(kg|lbs?|st)\s*$/i.test(text.trim())) {
    return null;
  }

  const raw = parseFloat(match[1]);
  if (!Number.isFinite(raw) || raw <= 0 || raw > 700) return null;

  const unitRaw = match[2].toLowerCase();
  let unit: "kg" | "lbs" | "stone";
  let kg: number;

  if (unitRaw.startsWith("st")) {
    unit = "stone";
    kg = raw * 6.35029;
  } else if (unitRaw.startsWith("lb") || unitRaw.startsWith("pound")) {
    unit = "lbs";
    kg = raw * 0.453592;
  } else {
    unit = "kg";
    kg = raw;
  }

  kg = Math.round(kg * 100) / 100;

  if (kg < 20 || kg > 320) return null;

  return { value_kg: kg, original_value: raw, original_unit: unit };
}
