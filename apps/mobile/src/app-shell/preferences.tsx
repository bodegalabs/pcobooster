import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { Appearance } from "react-native";

import { deviceDiagnostics } from "../diagnostics/device-diagnostics";
import type { PlainStorage } from "../session/credential-store";
import { deviceAnalytics } from "./device-analytics";
/** System, Light, or Dark (the web's theme menu), kept across launches. */
import type { AppAppearance } from "./preference-values";
import {
  appearances,
  APPEARANCE_KEY,
  ANALYTICS_OPT_OUT_KEY,
} from "./preference-values";

export interface Preferences {
  readonly appearance: AppAppearance;
  readonly setAppearance: (appearance: AppAppearance) => void;
  /** "Share usage analytics and error reports" is off. Analytics is opt-out, as on the web and the Swift app. */
  readonly analyticsOptedOut: boolean | null;
  readonly setAnalyticsOptedOut: (optedOut: boolean) => void;
}

const PreferencesContext = createContext<Preferences | null>(null);

export const usePreferences = (): Preferences => {
  const value = useContext(PreferencesContext);
  if (value === null) {
    throw new Error("usePreferences needs a PreferencesProvider above it");
  }
  return value;
};

const isAppearance = (value: string | null): value is AppAppearance =>
  appearances.some((appearance) => appearance === value);

/** Applies the appearance to the window at once; the switch is instant, like the web's. */
const applyAppearance = (appearance: AppAppearance) => {
  Appearance.setColorScheme(
    appearance === "system" ? "unspecified" : appearance
  );
};

/**
 * The device's preferences. `storage` is null in the fixture harness, which always starts from
 * the defaults so screenshots do not depend on what was chosen last.
 */
export const PreferencesProvider = ({
  storage,
  children,
}: {
  storage: PlainStorage | null;
  children: ReactNode;
}) => {
  const [appearance, setAppearance] = useState<AppAppearance>("system");
  const [analyticsOptedOut, setAnalyticsOptedOut] = useState<boolean | null>(
    storage === null ? false : null
  );

  useEffect(() => {
    if (storage === null) {
      return;
    }
    void (async () => {
      const [savedAppearance, savedOptOut] = await Promise.all([
        storage.getItem(APPEARANCE_KEY),
        storage.getItem(ANALYTICS_OPT_OUT_KEY),
      ]);
      if (isAppearance(savedAppearance)) {
        setAppearance(savedAppearance);
        applyAppearance(savedAppearance);
      }
      setAnalyticsOptedOut(savedOptOut === "true");
      deviceAnalytics.setOptedOut(savedOptOut === "true");
      // Error reports follow the same switch; never set means opted in, as for analytics.
      deviceDiagnostics.setPreference(
        savedOptOut === "true" ? "opted-out" : "opted-in"
      );
    })();
  }, [storage]);

  const changeAppearance = useCallback(
    (next: AppAppearance) => {
      setAppearance(next);
      applyAppearance(next);
      void storage?.setItem(APPEARANCE_KEY, next);
    },
    [storage]
  );

  const changeAnalyticsOptedOut = useCallback(
    (next: boolean) => {
      deviceAnalytics.setOptedOut(next);
      deviceDiagnostics.setPreference(next ? "opted-out" : "opted-in");
      setAnalyticsOptedOut(next);
      void storage?.setItem(ANALYTICS_OPT_OUT_KEY, String(next));
    },
    [storage]
  );

  const value = useMemo(
    () => ({
      appearance,
      setAppearance: changeAppearance,
      analyticsOptedOut,
      setAnalyticsOptedOut: changeAnalyticsOptedOut,
    }),
    [analyticsOptedOut, appearance, changeAnalyticsOptedOut, changeAppearance]
  );
  return <PreferencesContext value={value}>{children}</PreferencesContext>;
};
