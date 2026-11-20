/**
 * Runs once when the server starts (Next's instrumentation hook), before
 * any request is handled.
 *
 * It installs the meter on paid AI calls (lib/system/aiMeter.ts): from
 * then on every outbound call to a paid AI endpoint, from any route written
 * now or later, is refused when the month's cap is spent and otherwise has
 * its cost recorded. Node runtime only: the middleware's runtime makes no
 * such calls.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installAiMeter } = await import("@/lib/system/aiMeter");
    installAiMeter();
  }
}
