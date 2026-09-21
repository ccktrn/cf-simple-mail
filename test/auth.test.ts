import { expect, test } from "bun:test";
import { hashPassword, verifyPassword } from "../app/lib/auth/password.server";
import { createSession, validSession } from "../app/lib/auth/session.server";
test("a session is accepted only with its signing secret", async () => { const token = await createSession("secret", 60); expect(await validSession(token, "secret")).toBe(true); expect(await validSession(token, "other-secret")).toBe(false); });
test("Argon2id verifier accepts only its password", async () => { const verifier = await hashPassword("correct horse", new Uint8Array(16).fill(7)); expect(await verifyPassword("correct horse", verifier)).toBe(true); expect(await verifyPassword("wrong", verifier)).toBe(false); });
