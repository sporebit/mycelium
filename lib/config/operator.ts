export const OPERATOR = {
  firstName: "Phil",
  lastName: "",
  role: "Operator",
  city: "Manchester",
  timezone: process.env.USER_TIMEZONE ?? "Europe/London",
  // Rough coordinates for Manchester, UK. Used by /api/sun for sunrise/sunset.
  // Tweak for finer precision if needed.
  latitude: 53.4808,
  longitude: -2.2426,
};
