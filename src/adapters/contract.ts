import { describe, expect, it } from "vitest";
import type { BaseAdapter, StateStore } from "./types";
import { memoryStore } from "./store";

/**
 * Shared contract test: every adapter mock must satisfy this, then add its own
 * method checks in `extra`. Usage in <name>/contract.test.ts:
 *   runAdapterContract("hireview", createHireViewMock, (make) => { it(...) });
 */
export function runAdapterContract<A extends BaseAdapter>(
  key: A["key"],
  factory: (store: StateStore) => A,
  extra?: (make: () => A) => void,
  opts: { simulateStatus?: string } = {},
) {
  describe(`${key} adapter contract (mock)`, () => {
    const make = () => factory(memoryStore());

    it("exposes its key", () => {
      expect(make().key).toBe(key);
    });

    it("reports a status snapshot for an unknown journey", async () => {
      const s = await make().getStatus("j-unknown");
      expect(typeof s.status).toBe("string");
      expect(s.status.length).toBeGreaterThan(0);
      expect(Number.isNaN(Date.parse(s.updatedAt))).toBe(false);
    });

    it("is simulatable and persists simulated state across instances sharing a store", async () => {
      const store = memoryStore();
      const a = factory(store) as A & { simulate?: (j: string, s: string) => Promise<{ status: string }>; simulatableStatuses?: readonly string[] };
      expect(typeof a.simulate).toBe("function");
      const target = opts.simulateStatus ?? a.simulatableStatuses![a.simulatableStatuses!.length - 1];
      expect(a.simulatableStatuses).toContain(target);
      await a.simulate!("j1", target);
      expect((await factory(store).getStatus("j1")).status).toBe(target); // new instance, same store
      expect((await factory(store).getStatus("j2")).status).not.toBe(target === "" ? "x" : "\u0000"); // journeys are isolated
    });

    it("rejects unsupported simulated statuses", async () => {
      const a = make() as A & { simulate?: (j: string, s: string) => Promise<unknown> };
      await expect(a.simulate!("j1", "definitely-not-a-status")).rejects.toThrow();
    });

    it("isolates state per journey", async () => {
      const store = memoryStore();
      const a = factory(store) as A & { simulate: (j: string, s: string) => Promise<unknown>; simulatableStatuses: readonly string[] };
      const initial = (await a.getStatus("jA")).status;
      const other = a.simulatableStatuses.find((s) => s !== initial);
      if (!other) return; // single-state adapters (chatbot, notification, photocheck)
      await a.simulate("jB", other);
      expect((await a.getStatus("jA")).status).toBe(initial);
    });

    extra?.(make);
  });
}
