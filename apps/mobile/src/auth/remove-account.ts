import type { StoredSession } from "./protocol";

/** Clear local credentials before any revocation request, including when offline. */
export const removeRememberedAccount = async ({
  session,
  userId,
  persist,
  revoke,
}: {
  session: StoredSession;
  userId: string;
  persist: (session: StoredSession) => Promise<void>;
  revoke: (token: string) => Promise<void>;
}): Promise<void> => {
  const removed = session.accounts.find(({ user }) => user.id === userId);
  await persist({
    ...session,
    activeUserId: session.activeUserId === userId ? null : session.activeUserId,
    demoToken: null,
    accounts: session.accounts.filter(({ user }) => user.id !== userId),
  });
  if (removed !== undefined) {
    await revoke(removed.token);
  }
};
