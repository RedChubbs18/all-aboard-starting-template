import { AdapterNotConfiguredError, type AdapterKey } from "./types";

/** REAL mode placeholder: any method call throws until a real implementation is registered. */
export function realStub<T extends { key: AdapterKey }>(key: AdapterKey): T {
  return new Proxy({ key } as T, {
    get(target, prop) {
      if (prop === "key") return key;
      if (typeof prop === "symbol" || prop === "then") return undefined;
      return () => {
        throw new AdapterNotConfiguredError(key);
      };
    },
  });
}
