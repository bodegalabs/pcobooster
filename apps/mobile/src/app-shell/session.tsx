import { createContext, useContext } from "react";

import type { DeviceAccount } from "./device-accounts";

/** Who is signed in on this device, and the sign-in actions (Swift `AppModel.session`). */
export interface SessionValue {
  /** People remembered on this device, most recent first. */
  readonly accounts: readonly DeviceAccount[];
  /** The signed-in person, or null on the sign-in screen. */
  readonly active: DeviceAccount | null;
  /** "Sign in with Planning Center". */
  readonly signIn: () => void;
  readonly continueAs: (account: DeviceAccount) => void;
  /** Signs a remembered account out of this device. */
  readonly forget: (account: DeviceAccount) => void;
  readonly signOut: () => void;
}

export const SessionContext = createContext<SessionValue | null>(null);

export const useSession = (): SessionValue => {
  const value = useContext(SessionContext);
  if (value === null) {
    throw new Error("useSession needs an AppProviders above it");
  }
  return value;
};
