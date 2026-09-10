import { describe, expect, it } from "vitest";
import {
  PRINCIPAL_AAL_HEADER,
  PRINCIPAL_HEADER,
  PRINCIPAL_USER_HEADER,
  isAal2,
  isApiPath,
  isPublicPath,
  isSensitivePath,
  matchesBearer,
  matchesSecret,
  stripPrincipalHeaders,
  timingSafeEqual,
} from "./gate";

describe("route classification", () => {
  it("public prefixes bypass the gate", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/login?next=/x")).toBe(true);
    expect(isPublicPath("/api/auth/callback")).toBe(true);
    expect(isPublicPath("/api/auth/break-glass")).toBe(true);
    expect(isPublicPath("/api/telegram/webhook")).toBe(true);
    expect(isPublicPath("/api/health-import")).toBe(true);
  });

  it("everything else is gated", () => {
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/api/tasks")).toBe(false);
    expect(isPublicPath("/api/authz")).toBe(false); // "/api/auth/" needs the slash
    expect(isPublicPath("/admin")).toBe(false);
  });

  it("sensitive prefixes match the path and its children only", () => {
    expect(isSensitivePath("/admin")).toBe(true);
    expect(isSensitivePath("/admin/users")).toBe(true);
    expect(isSensitivePath("/api/admin/users")).toBe(true);
    expect(isSensitivePath("/administer")).toBe(false);
    expect(isSensitivePath("/other/settings/security")).toBe(false);
    // Part 5: written with a trailing slash in the list; must still match
    // its children (a first-factor session once deleted an account here).
    expect(isSensitivePath("/api/account/delete")).toBe(true);
    expect(isSensitivePath("/api/account/access-log")).toBe(true);
    expect(isSensitivePath("/api/account")).toBe(true);
    expect(isSensitivePath("/api/accounts")).toBe(false);
  });

  it("api paths are recognised", () => {
    expect(isApiPath("/api/x")).toBe(true);
    expect(isApiPath("/apix")).toBe(false);
  });
});

describe("secrets", () => {
  it("timingSafeEqual compares whole strings", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });

  it("an unset or empty secret never matches", () => {
    expect(matchesSecret("x", undefined)).toBe(false);
    expect(matchesSecret("", "")).toBe(false);
    expect(matchesSecret(undefined, "x")).toBe(false);
    expect(matchesBearer("Bearer x", undefined)).toBe(false);
  });

  it("bearer must be exact", () => {
    expect(matchesBearer("Bearer s3cret", "s3cret")).toBe(true);
    expect(matchesBearer("bearer s3cret", "s3cret")).toBe(false);
    expect(matchesBearer("s3cret", "s3cret")).toBe(false);
    expect(matchesBearer("Bearer s3cret ", "s3cret")).toBe(false);
  });
});

describe("principal headers", () => {
  it("client-supplied principal headers are stripped", () => {
    const h = new Headers({
      [PRINCIPAL_HEADER]: "system",
      [PRINCIPAL_USER_HEADER]: "someone",
      [PRINCIPAL_AAL_HEADER]: "aal2",
      "x-other": "kept",
    });
    stripPrincipalHeaders(h);
    expect(h.get(PRINCIPAL_HEADER)).toBeNull();
    expect(h.get(PRINCIPAL_USER_HEADER)).toBeNull();
    expect(h.get(PRINCIPAL_AAL_HEADER)).toBeNull();
    expect(h.get("x-other")).toBe("kept");
  });

  it("only the literal aal2 counts", () => {
    expect(isAal2("aal2")).toBe(true);
    expect(isAal2("aal1")).toBe(false);
    expect(isAal2("AAL2")).toBe(false);
    expect(isAal2(undefined)).toBe(false);
  });
});
