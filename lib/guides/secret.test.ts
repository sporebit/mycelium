import { describe, expect, it } from "vitest";
import { isSecretLike, SECRET_REFUSAL } from "./secret";

describe("isSecretLike", () => {
  it.each([
    "sk-ant-api03-abcdefghijklmnop",
    "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
    "gho_16C7e42F292c6912E7710c838347Ae178B4a",
    "mtk_live_2f9a8b",
    "xoxb-1234567890-abcdef",
    "AKIAIOSFODNN7EXAMPLE",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.sig",
    "-----BEGIN PRIVATE KEY-----\nMIIEv",
    "0123456789abcdef0123456789abcdef",
    "the key is 0123456789abcdef0123456789abcdef0123",
    "Zk3pQ9xL2mN8vR4tY7wB1cD6",
    "my token Zk3pQ9xL2mN8vR4tY7wB1cD6 thanks",
  ])("refuses %s", (v) => {
    expect(isSecretLike(v)).toBe(true);
  });

  it.each([
    "",
    "   ",
    "phil@example.com",
    "mycelium.sporebit.com",
    "A:\\Projects\\Mycelium",
    "The upper CRON_SECRET line is the one production uses",
    "https://github.com/SomeOwner/SomeRepo2026/actions/runs/123456789",
    "3100",
    "2026-11-28",
    "supabase_db_Mycelium",
    "skipped the second step",
    "xoxo",
    "abcdefghijklmnopqrstuvwxyz",
    "ABCDEFGHIJKLMNOPQRSTUVWX12",
  ])("accepts %s", (v) => {
    expect(isSecretLike(v)).toBe(false);
  });

  it("treats null and undefined as nothing", () => {
    expect(isSecretLike(null)).toBe(false);
    expect(isSecretLike(undefined)).toBe(false);
  });

  it("says what to do instead, with no em dash", () => {
    expect(SECRET_REFUSAL).toMatch(/^That looks like a secret\./);
    expect(SECRET_REFUSAL).not.toMatch(/\u2014/);
  });
});
