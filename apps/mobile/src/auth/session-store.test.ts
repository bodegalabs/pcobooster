import { makeRpcError } from "@pcobooster/client/testing";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { emptySession } from "./protocol";
import type { StoredSession } from "./protocol";
import { NativeSessionStore } from "./session-store";
import type { SessionStoreDependencies } from "./session-store";

const accountSession = (id: string, token = `token-${id}`): StoredSession => ({
  activeUserId: id,
  demoToken: null,
  accounts: [
    {
      token,
      user: { id, name: id, email: `${id}@example.com`, image: null },
      selectedAccountId: `org-${id}`,
    },
  ],
});
const fixture = (overrides: Partial<SessionStoreDependencies> = {}) => {
  const saved = new Map<string, string>();
  const failures: Error[] = [];
  const dependencies: SessionStoreDependencies = {
    origin: "https://synthetic.example",
    digest: async (value) => await Promise.resolve(value),
    storage: {
      getItem: async (key) => await Promise.resolve(saved.get(key) ?? null),
      setItem: async (key, value) => {
        saved.set(key, value);
        await Promise.resolve();
      },
    },
    authenticate: async () => await Promise.resolve(null),
    revoke: async () => {
      await Promise.resolve();
    },
    reportError: (error) => {
      failures.push(error);
    },
    ...overrides,
  };
  return {
    store: new NativeSessionStore(dependencies),
    saved,
    failures,
    dependencies,
  };
};

describe("Native session ownership", () => {
  it("clears the persisted active login before an offline revocation fails", async () => {
    const { store, saved } = fixture({
      revoke: async () => {
        await Promise.resolve();
        throw new Error("Offline");
      },
    });
    await store.update(accountSession("a"));
    await expect(store.signOut()).rejects.toThrow("Offline");
    expect(store.getSnapshot().session).toStrictEqual(emptySession);
    expect(
      Schema.decodeUnknownSync(Schema.Json)(
        JSON.parse([...saved.values()][0] ?? "null")
      )
    ).toStrictEqual(emptySession);
  });

  it("does not expire a new account when an old in-flight RPC returns unauthorized", async () => {
    const response = Promise.withResolvers<Response>();
    const started = Promise.withResolvers<string | number>();
    const messageSchema = Schema.Struct({
      id: Schema.Union([Schema.String, Schema.Number]),
    });
    const { store } = fixture({
      fetch: async (url, init) => {
        const message = Schema.decodeUnknownSync(messageSchema)(
          await new Request(url, init).json()
        );
        started.resolve(message.id);
        return await response.promise;
      },
    });
    await store.update(accountSession("a"));
    const request = store.getSnapshot().rpc.call("session.status", {});
    const requestId = await started.promise;
    await store.update(accountSession("b"));
    response.resolve(
      Response.json([
        {
          _tag: "Exit",
          requestId,
          exit: {
            _tag: "Failure",
            cause: [{ _tag: "Fail", error: makeRpcError("UNAUTHORIZED") }],
          },
        },
      ])
    );
    await expect(request).rejects.toMatchObject({ status: 401 });
    expect(store.getSnapshot().session.activeUserId).toBe("b");
    expect(store.getSnapshot()).toMatchObject({ expired: false });
  });

  it("serializes slower Keychain writes so an account switch remains the persisted snapshot", async () => {
    const firstStarted = Promise.withResolvers<null>();
    const releaseFirst = Promise.withResolvers<null>();
    let written: string | null = null;
    let count = 0;
    const { store } = fixture({
      storage: {
        getItem: async () => await Promise.resolve(written),
        setItem: async (_key, value) => {
          count += 1;
          if (count === 1) {
            firstStarted.resolve(null);
            await releaseFirst.promise;
          }
          written = value;
        },
      },
    });
    const first = store.update(accountSession("a"));
    await firstStarted.promise;
    const second = store.update(accountSession("b"));
    releaseFirst.resolve(null);
    await Promise.all([first, second]);
    expect(JSON.parse(written ?? "null")).toStrictEqual(accountSession("b"));
  });

  it("isolates cache scopes by origin, account, token and demo while preserving remembered identity", async () => {
    const { store, dependencies } = fixture();
    await store.update(accountSession("a"));
    const account = store.getSnapshot().scope;
    await store.update(accountSession("a", "new-token"));
    const renewed = store.getSnapshot().scope;
    await store.update({ ...accountSession("a"), demoToken: "demo-a" });
    const demo = store.getSnapshot().scope;
    expect(new Set([account, renewed, demo]).size).toBe(3);
    const other = new NativeSessionStore({
      ...dependencies,
      origin: "https://other.example",
    });
    await other.update(accountSession("a"));
    expect(other.getSnapshot().scope).not.toBe(account);
    await store.restore();
    expect(store.getSnapshot().session.accounts[0]?.user.id).toBe("a");
  });

  it("ignores an old unauthorized response while the next account's digest is still pending", async () => {
    const digestStarted = Promise.withResolvers<null>();
    const releaseDigest = Promise.withResolvers<null>();
    const response = Promise.withResolvers<Response>();
    const started = Promise.withResolvers<string | number>();
    const messageSchema = Schema.Struct({
      id: Schema.Union([Schema.String, Schema.Number]),
    });
    const { store } = fixture({
      digest: async (value) => {
        if (value.includes("token-b")) {
          digestStarted.resolve(null);
          await releaseDigest.promise;
        }
        return value;
      },
      fetch: async (url, init) => {
        const message = Schema.decodeUnknownSync(messageSchema)(
          await new Request(url, init).json()
        );
        started.resolve(message.id);
        return await response.promise;
      },
    });
    await store.update(accountSession("a"));
    const request = store.getSnapshot().rpc.call("session.status", {});
    const requestId = await started.promise;
    const switching = store.update(accountSession("b"));
    await digestStarted.promise;
    response.resolve(
      Response.json([
        {
          _tag: "Exit",
          requestId,
          exit: {
            _tag: "Failure",
            cause: [{ _tag: "Fail", error: makeRpcError("UNAUTHORIZED") }],
          },
        },
      ])
    );
    await expect(request).rejects.toMatchObject({ status: 401 });
    releaseDigest.resolve(null);
    await switching;
    expect(store.getSnapshot().session.activeUserId).toBe("b");
    expect(store.getSnapshot()).toMatchObject({ expired: false });
  });
});
