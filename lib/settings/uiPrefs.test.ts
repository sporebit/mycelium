import { describe, expect, it } from "vitest";
import { SHELLS, UI_PREFS_DEFAULTS, shellOf } from "./uiPrefs";

describe("the shell preference", () => {
  it("offers three shells and Classic stays the default", () => {
    expect([...SHELLS]).toEqual(["classic", "new", "field"]);
    expect(UI_PREFS_DEFAULTS.shell).toBe("classic");
  });

  it("reads a stored value safely: the three are kept, anything else is Classic", () => {
    expect(shellOf("field")).toBe("field");
    expect(shellOf("new")).toBe("new");
    expect(shellOf("classic")).toBe("classic");
    for (const v of [undefined, null, "", "Field", "tiles", 3, {}]) expect(shellOf(v)).toBe("classic");
  });
});
