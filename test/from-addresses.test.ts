import { expect, test } from "bun:test";
import { fromAddresses } from "../app/lib/mail/from-addresses.server";

test("sender addresses come only from the configured allowlist", () => {
  expect(fromAddresses({ MAIL_FROM_ADDRESSES: '["recovery@example.com", "support@example.com"]' } as never)).toEqual(["recovery@example.com", "support@example.com"]);
  expect(fromAddresses({ MAIL_FROM: "legacy@example.com" } as never)).toEqual(["legacy@example.com"]);
  expect(() => fromAddresses({ MAIL_FROM_ADDRESSES: "not-json" } as never)).toThrow();
});
