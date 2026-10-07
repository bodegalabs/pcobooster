import { describe, expect, it } from "vitest";

import { redirectSystemPath } from "../../app/+native-intent";
import { receiveDemoKeys } from "../app-shell/link-inbox";

describe(redirectSystemPath, () => {
  it.each([true, false])(
    "drops auth callbacks on initial=%s without delivering a demo key",
    (initial) => {
      const keys: string[] = [];
      const stop = receiveDemoKeys((key) => {
        keys.push(key);
      });
      expect(
        redirectSystemPath({
          path: "pcobooster://auth/callback?code=secret&state=s",
          initial,
        })
      ).toBe(initial ? "/" : null);
      expect(keys).toStrictEqual([]);
      stop();
    }
  );

  it("holds a cold demo link until the session subscribes, and delivers warm HTTPS links", () => {
    expect(
      redirectSystemPath({
        path: "pcobooster://demo/cold-demo-key",
        initial: true,
      })
    ).toBe("/");
    const keys: string[] = [];
    const stop = receiveDemoKeys((key) => {
      keys.push(key);
    });
    expect(keys).toStrictEqual(["cold-demo-key"]);
    expect(
      redirectSystemPath({
        path: "https://pcobooster.com/demo/warm-demo-key",
        initial: false,
      })
    ).toBeNull();
    expect(keys).toStrictEqual(["cold-demo-key", "warm-demo-key"]);
    stop();
  });

  it("routes valid application paths and ignores untrusted URLs", () => {
    expect(
      redirectSystemPath({ path: "pcobooster://account", initial: false })
    ).toBe("/account");
    expect(
      redirectSystemPath({
        path: "https://evil.example/demo/evil-key",
        initial: false,
      })
    ).toBeNull();
  });
});
