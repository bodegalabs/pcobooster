import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  clearIfFreshInstall,
  INSTALL_MARKER_KEY,
  makeCredentialStore,
  memorySecretStorage,
  SESSION_ITEM_KEY,
} from "./credential-store";
import type { StoredSession } from "./device-session";
import { MAX_DEVICE_ACCOUNTS } from "./device-session";
import type { NativeSignInResult } from "./native-sign-in";
import { credentialHeaders, SessionStore } from "./session-store";
import type { SessionApi } from "./session-store";

const NOW = new Date("2026-10-01T17:00:00.000Z");

const result = (
  userId: string,
  token: string,
  selectedAccountId: string | null = `acct_${userId}`
): NativeSignInResult => ({
  token,
  user: { id: userId, name: `Person ${userId}`, email: `${userId}@x.test` },
  selectedAccountId,
});

const makeStore = (overrides: Partial<SessionApi> = {}) => {
  const secrets = memorySecretStorage();
  const revoked: string[] = [];
  const forgotten: string[] = [];
  let clock = NOW.getTime();
  const store = new SessionStore({
    store: makeCredentialStore(secrets),
    api: {
      selectAccount: async (id) => await Promise.resolve(id),
      startDemo: async () => await Promise.resolve("demo-token"),
      exitDemo: async () => {
        await Promise.resolve();
      },
      isSignedInWithoutCredentials: async () => await Promise.resolve(false),
      ...overrides,
    },
    revoke: async (token) => {
      revoked.push(token);
      await Promise.resolve();
    },
    credentialIdentity: async (token) =>
      await Promise.resolve(createHash("sha256").update(token).digest("hex")),
    now: () => {
      clock += 1000;
      return new Date(clock);
    },
    onForget: (ids) => {
      forgotten.push(...ids);
    },
  });
  return { store, secrets, revoked, forgotten };
};

describe(SessionStore, () => {
  it("launches until the Keychain is read, then signs nobody in", async () => {
    const { store } = makeStore();
    expect(store.getSnapshot().phase.kind).toBe("launching");
    await store.restore();
    expect(store.getSnapshot().phase.kind).toBe("signedOut");
    expect(store.credentials()).toStrictEqual({
      bearerToken: null,
      accountId: null,
      demoToken: null,
    });
  });

  it("signs in, sends the bearer token and account, and keeps the token only in secret storage", async () => {
    const { store, secrets } = makeStore();
    await store.restore();
    await store.completeSignIn(result("u1", "tok1.sig"));
    await store.flush();
    expect(store.getSnapshot().phase.kind).toBe("signedIn");
    expect(credentialHeaders(store.credentials())).toStrictEqual({
      authorization: "Bearer tok1.sig",
      "x-pcobooster-account": "acct_u1",
    });
    expect(store.getSnapshot().scope).toMatch(
      /^user:u1:acct_u1:[a-f0-9]{64}$/u
    );
    expect(secrets.items.get(SESSION_ITEM_KEY)).toContain("tok1.sig");

    const reloaded = new SessionStore({
      store: makeCredentialStore(secrets),
      api: {
        selectAccount: async () => await Promise.resolve(null),
        startDemo: async () => await Promise.resolve(""),
        exitDemo: async () => {
          await Promise.resolve();
        },
        isSignedInWithoutCredentials: async () => await Promise.resolve(false),
      },
      revoke: async () => {
        await Promise.resolve();
      },
      now: () => NOW,
      credentialIdentity: async (token) =>
        await Promise.resolve(createHash("sha256").update(token).digest("hex")),
    });
    await reloaded.restore();
    const { phase } = reloaded.getSnapshot();
    expect(
      phase.kind === "signedIn" ? phase.account.lastUsedAt.toISOString() : null
    ).toBe("2026-10-01T17:00:01.000Z");
  });

  it("remembers several people, switches locally, and revokes a replaced token", async () => {
    const { store, revoked } = makeStore();
    await store.restore();
    await store.completeSignIn(result("u1", "tok1"));
    await store.completeSignIn(result("u2", "tok2"));
    expect(
      store.getSnapshot().stored.accounts.map((a) => a.userId)
    ).toStrictEqual(["u2", "u1"]);
    store.switchAccount("u1");
    expect(store.credentials().bearerToken).toBe("tok1");
    expect(store.getSnapshot().stored.accounts[0]?.userId).toBe("u1");
    await store.completeSignIn(result("u1", "tok1b"));
    expect(revoked).toStrictEqual(["tok1"]);
  });

  it(`drops the least recently used past ${MAX_DEVICE_ACCOUNTS} people and revokes them`, async () => {
    const { store, revoked, forgotten } = makeStore();
    await store.restore();
    await store.completeSignIn(result("u1", "tok-u1"));
    await store.completeSignIn(result("u2", "tok-u2"));
    await store.completeSignIn(result("u3", "tok-u3"));
    await store.completeSignIn(result("u4", "tok-u4"));
    await store.completeSignIn(result("u5", "tok-u5"));
    expect(store.getSnapshot().stored.accounts).toHaveLength(
      MAX_DEVICE_ACCOUNTS
    );
    expect(revoked).toStrictEqual(["tok-u1"]);
    expect(forgotten).toStrictEqual(["u1"]);
  });

  it("signs the active person out: revokes, forgets, and leaves others remembered", async () => {
    const { store, revoked, forgotten, secrets } = makeStore();
    await store.restore();
    await store.completeSignIn(result("u1", "tok1"));
    await store.completeSignIn(result("u2", "tok2"));
    await store.signOut();
    await store.flush();
    expect(store.getSnapshot().phase.kind).toBe("signedOut");
    expect(
      store.getSnapshot().stored.accounts.map((a) => a.userId)
    ).toStrictEqual(["u1"]);
    expect(revoked).toStrictEqual(["tok2"]);
    expect(forgotten).toStrictEqual(["u2"]);
    await store.remove("u1");
    await store.flush();
    expect(secrets.items.has(SESSION_ITEM_KEY)).toBeFalsy();
  });

  it("moves to needsSignIn on a 401 for the active token only", async () => {
    const { store } = makeStore();
    await store.restore();
    await store.completeSignIn(result("u1", "tok1"));
    const sentAsU1 = store.credentials();
    await store.completeSignIn(result("u2", "tok2"));
    store.handleUnauthorized(sentAsU1);
    expect(store.getSnapshot().phase.kind).toBe("signedIn");

    store.handleUnauthorized(store.credentials());
    const { phase } = store.getSnapshot();
    expect(phase.kind).toBe("needsSignIn");
    expect(phase.kind === "needsSignIn" ? phase.account.name : null).toBe(
      "Person u2"
    );
    expect(store.credentials().bearerToken).toBeNull();
    // A replacement credential gets its own cache namespace.
    const { scope } = store.getSnapshot();
    await store.completeSignIn(result("u2", "tok2b"));
    expect([
      store.getSnapshot().scope === scope,
      store.getSnapshot().phase.kind,
    ]).toStrictEqual([false, "signedIn"]);
  });

  it("runs a demo on its own header, ends it on its 401, and returns to the person", async () => {
    const { store } = makeStore();
    await store.restore();
    await store.completeSignIn(result("u1", "tok1"));
    await store.startDemo("demo-key-123");
    expect(store.getSnapshot().phase.kind).toBe("demo");
    expect(credentialHeaders(store.credentials())).toStrictEqual({
      "x-pcobooster-demo": "demo-token",
    });
    store.handleUnauthorized(store.credentials());
    expect(store.getSnapshot().phase.kind).toBe("signedIn");
  });

  it("switches organizations through accounts.select and rescopes", async () => {
    const { store } = makeStore({
      selectAccount: async () => await Promise.resolve("acct_other"),
    });
    await store.restore();
    await store.completeSignIn(result("u1", "tok1"));
    await store.switchOrganization("acct_other");
    expect(store.credentials().accountId).toBe("acct_other");
    expect(store.getSnapshot().scope).toMatch(
      /^user:u1:acct_other:[a-f0-9]{64}$/u
    );
  });

  it("enters the development phase only when the API signs requests in on its own", async () => {
    const { store } = makeStore({
      isSignedInWithoutCredentials: async () => await Promise.resolve(true),
    });
    await store.restore();
    await store.checkDevelopmentBypass();
    expect(store.getSnapshot().phase.kind).toBe("development");
    store.handleUnauthorized(store.credentials());
    expect(store.getSnapshot().phase.kind).toBe("signedOut");
  });
});

describe("the Keychain item", () => {
  it("deletes an unreadable item instead of staying stuck", async () => {
    const secrets = memorySecretStorage({ [SESSION_ITEM_KEY]: "{not json" });
    const loaded = await makeCredentialStore(secrets).load();
    expect(loaded.accounts).toHaveLength(0);
    expect(secrets.items.has(SESSION_ITEM_KEY)).toBeFalsy();
  });

  it("is cleared on the first launch of a new install only", async () => {
    const secrets = memorySecretStorage({ [SESSION_ITEM_KEY]: "{}" });
    const plain = new Map<string, string>();
    const storage = {
      getItem: async (key: string) =>
        await Promise.resolve(plain.get(key) ?? null),
      setItem: async (key: string, value: string) => {
        plain.set(key, value);
        await Promise.resolve();
      },
    };
    await expect(clearIfFreshInstall(secrets, storage)).resolves.toBeTruthy();
    expect(secrets.items.has(SESSION_ITEM_KEY)).toBeFalsy();
    expect(plain.has(INSTALL_MARKER_KEY)).toBeTruthy();
    secrets.items.set(SESSION_ITEM_KEY, "{}");
    await expect(clearIfFreshInstall(secrets, storage)).resolves.toBeFalsy();
    expect(secrets.items.has(SESSION_ITEM_KEY)).toBeTruthy();
  });
});

describe("launch races and cache identity", () => {
  it.each(["demo", "signIn"])(
    "preserves remembered accounts when %s arrives during restore",
    async (action) => {
      const initial = makeStore();
      await initial.store.completeSignIn(result("remembered", "old-token"));
      await initial.store.flush();
      const loaded = initial.store.getSnapshot().stored;
      const pending = Promise.withResolvers<StoredSession>();
      let loads = 0;
      const saved: StoredSession[] = [];
      const store = new SessionStore({
        store: {
          load: async () => {
            loads += 1;
            return await pending.promise;
          },
          save: async (value) => {
            saved.push(value);
            await Promise.resolve();
          },
        },
        api: {
          selectAccount: async () => await Promise.resolve(null),
          startDemo: async () => await Promise.resolve("demo-token"),
          exitDemo: async () => {
            await Promise.resolve();
          },
          isSignedInWithoutCredentials: async () =>
            await Promise.resolve(false),
        },
        revoke: async () => {
          await Promise.resolve();
        },
        now: () => NOW,
        credentialIdentity: async (token) => await Promise.resolve(token),
      });
      const restoring = store.restore();
      const changing =
        action === "demo"
          ? store.startDemo("key")
          : store.completeSignIn(result("new", "new-token"));
      await Promise.resolve();
      await Promise.resolve();
      pending.resolve(loaded);
      await Promise.all([restoring, changing]);
      await store.flush();
      expect(loads).toBe(1);
      expect(
        store
          .getSnapshot()
          .stored.accounts.some((account) => account.userId === "remembered")
      ).toBeTruthy();
      expect(store.getSnapshot().phase.kind).toBe(
        action === "demo" ? "demo" : "signedIn"
      );
      expect(
        saved
          .at(-1)
          ?.accounts.some((account) => account.userId === "remembered")
      ).toBeTruthy();
    }
  );

  it("does not persist an identity-less seeded credential", () => {
    const { store } = makeStore();
    store.seed({
      accounts: [],
      activeUserId: null,
      demo: { token: "unknown", startedAt: NOW },
    });
    expect(store.getSnapshot().persisted).toBeFalsy();
    expect(store.getSnapshot().scope).not.toBe("demo:fixture");
  });

  it("forgets old cache scopes when the same person gets a new token", async () => {
    const { store, forgotten } = makeStore();
    await store.completeSignIn(result("u1", "old"));
    await store.completeSignIn(result("u1", "new"));
    expect(forgotten).toStrictEqual(["u1"]);
  });
});
