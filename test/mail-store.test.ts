import { describe, expect, test } from "bun:test";
import { MailStore } from "../app/lib/mail/store.server";
import type { MailMetadata } from "../app/lib/mail/types";

class MemoryKv {
  data = new Map<string, { value: ArrayBuffer; metadata: MailMetadata }>();
  async put(key: string, value: ArrayBuffer, options: { metadata: MailMetadata }) { this.data.set(key, { value, metadata: options.metadata }); }
  async getWithMetadata(key: string) { const item = this.data.get(key); return { value: item?.value ?? null, metadata: item?.metadata ?? null }; }
  async delete(key: string) { this.data.delete(key); }
  async list({ prefix }: { prefix: string }) { return { keys: [...this.data].filter(([key]) => key.startsWith(prefix)).map(([name, item]) => ({ name, metadata: item.metadata })), list_complete: true, cursor: "" }; }
}
const metadata: MailMetadata = { direction: "inbox", from: "from@example.com", to: "to@example.com", subject: "test", timestamp: "2026-09-20T00:00:00.000Z", retained: false, expiresAt: "2026-09-27T00:00:00.000Z" };
describe("MailStore", () => test("retaining and releasing preserves the raw message", async () => { const kv = new MemoryKv(), store = new MailStore(kv as unknown as KVNamespace), raw = new TextEncoder().encode("message").buffer; await store.save("inbox", "01K5VZ7CW3RRGSTTZXG1A2B3C4", raw, metadata, 100); await store.retain("inbox", "01K5VZ7CW3RRGSTTZXG1A2B3C4"); expect((await store.list("inbox"))[0].retained).toBe(true); await store.release("inbox", "01K5VZ7CW3RRGSTTZXG1A2B3C4", 100); const result = await store.get("inbox", "01K5VZ7CW3RRGSTTZXG1A2B3C4"); expect(result.metadata?.retained).toBe(false); expect(new TextDecoder().decode(result.value)).toBe("message"); }));
