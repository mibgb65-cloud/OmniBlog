import { describe, expect, it } from "vitest";
import { hashPassword, slugify, verifyPassword } from "./security";

describe("password security", () => {
  it("verifies the correct password and rejects a wrong one", async () => {
    const stored = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("correct horse battery staple", stored)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", stored)).resolves.toBe(false);
  });
});

describe("slugify", () => {
  it("creates a stable URL-safe slug", () => {
    expect(slugify("A Quiet Place to Think")).toBe("a-quiet-place-to-think");
  });

  it("falls back for non-latin titles", () => {
    expect(slugify("安静地写作")).toMatch(/^post-[a-f0-9]{8}$/);
  });
});

