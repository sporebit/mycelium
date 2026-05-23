export function localDateKey(tz?: string): string {
  const timezone = tz ?? process.env.USER_TIMEZONE ?? "Europe/London";
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
}

export function previousDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}
