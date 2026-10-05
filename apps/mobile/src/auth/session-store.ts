import { createRpcClient } from "@pcobooster/client/rpc";
import type { ProductClient } from "@pcobooster/client/rpc";
import { RpcError } from "@pcobooster/contracts/errors";
import { Schema } from "effect";

import {
  activeCredentials,
  emptySession,
  shouldExpireSession,
  storedSessionSchema,
} from "./protocol";
import type { NativeSession, StoredSession } from "./protocol";
import { removeRememberedAccount } from "./remove-account";

const secureKey = "pcobooster.session.v1";
export interface SessionStoreDependencies {
  origin: string;
  storage: {
    getItem: (key: string) => Promise<string | null>;
    setItem: (key: string, value: string) => Promise<void>;
  };
  digest: (value: string) => Promise<string>;
  authenticate: () => Promise<NativeSession | null>;
  revoke: (token: string) => Promise<void>;
  reportError: (error: Error) => void;
  fetch?: Parameters<typeof createRpcClient>[0]["fetch"];
}
export interface SessionSnapshot {
  session: StoredSession;
  launching: boolean;
  expired: boolean;
  scope: string;
  rpc: ProductClient;
}
export class NativeSessionStore {
  private readonly listeners = new Set<() => void>();
  private generation = 0;
  private desiredSession: StoredSession = emptySession;
  private writes: Promise<void> = Promise.resolve();
  private snapshot: SessionSnapshot;
  private readonly dependencies: SessionStoreDependencies;
  constructor(dependencies: SessionStoreDependencies) {
    this.dependencies = dependencies;
    this.snapshot = {
      session: emptySession,
      launching: true,
      expired: false,
      scope: "launching",
      rpc: this.client(emptySession),
    };
  }
  getSnapshot = (): SessionSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private readonly publish = (snapshot: SessionSnapshot): void => {
    this.snapshot = snapshot;
    for (const listener of this.listeners) {
      listener();
    }
  };
  private readonly client = (session: StoredSession): ProductClient => {
    const sent = activeCredentials(session);
    const headers = new Headers({ "x-pcobooster-client": "expo/0.1.0" });
    if (sent.token !== null) {
      headers.set("authorization", `Bearer ${sent.token}`);
    }
    if (sent.accountId !== null) {
      headers.set("x-pcobooster-account", sent.accountId);
    }
    if (sent.demoToken !== null) {
      headers.set("x-pcobooster-demo", sent.demoToken);
    }
    return createRpcClient({
      url: () => `${this.dependencies.origin}/api/rpc`,
      headers: () => headers,
      fetch: this.dependencies.fetch,
      onError: (error) => {
        if (
          error instanceof RpcError &&
          error.status === 401 &&
          shouldExpireSession(sent, activeCredentials(this.desiredSession))
        ) {
          void this.expireAfterUnauthorized();
        }
      },
    });
  };
  private readonly expireAfterUnauthorized = async (): Promise<void> => {
    try {
      await this.expire();
    } catch (error) {
      this.dependencies.reportError(
        error instanceof Error
          ? error
          : new Error("Could not clear expired credentials")
      );
    }
  };
  restore = async (): Promise<void> => {
    const { generation } = this;
    try {
      const data = await this.dependencies.storage.getItem(secureKey);
      if (data !== null && generation === this.generation) {
        await this.update(
          Schema.decodeUnknownSync(storedSessionSchema)(JSON.parse(data))
        );
      }
    } finally {
      this.publish({ ...this.snapshot, launching: false });
    }
  };
  update = async (session: StoredSession, expired = false): Promise<void> => {
    this.desiredSession = session;
    this.generation += 1;
    const { generation } = this;
    const scope = await this.dependencies.digest(
      JSON.stringify([this.dependencies.origin, activeCredentials(session)])
    );
    if (generation !== this.generation) {
      return;
    }
    this.publish({
      session,
      scope,
      expired,
      launching: false,
      rpc: this.client(session),
    });
    // Serialize native writes: an earlier account's slower Keychain save cannot overwrite a later switch.
    const previous = this.writes;
    const persist = async (): Promise<void> => {
      try {
        await previous;
      } catch {
        /* A new snapshot repairs the last failed write. */
      }
      await this.dependencies.storage.setItem(
        secureKey,
        JSON.stringify(session)
      );
    };
    this.writes = persist();
    await this.writes;
  };
  signIn = async (): Promise<void> => {
    const result = await this.dependencies.authenticate();
    if (result === null) {
      return;
    }
    const { session } = this.snapshot;
    await this.update({
      ...session,
      activeUserId: result.user.id,
      demoToken: null,
      accounts: [
        ...session.accounts.filter(({ user }) => user.id !== result.user.id),
        result,
      ],
    });
  };
  removeAccount = async (userId: string): Promise<void> => {
    const { session } = this.snapshot;
    await removeRememberedAccount({
      session,
      userId,
      persist: this.update,
      revoke: this.dependencies.revoke,
    });
  };
  signOut = async (): Promise<void> => {
    const { session } = this.snapshot;
    if (session.activeUserId !== null) {
      await this.removeAccount(session.activeUserId);
      return;
    }
    await this.update({ ...session, activeUserId: null, demoToken: null });
  };
  expire = async (): Promise<void> => {
    const { session } = this.snapshot;
    const credentials = activeCredentials(session);
    await this.update(
      {
        ...session,
        demoToken: null,
        activeUserId: null,
        accounts: session.accounts.filter(
          (account) => account.token !== credentials.token
        ),
      },
      true
    );
  };
}
