import { RpcError } from "@pcobooster/contracts/errors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Schema } from "effect";
import * as Crypto from "expo-crypto";

import { createNativeAnalytics } from "./analytics";
import type {
  NativeAnalyticsEvent,
  NativeAnalyticsProperties,
} from "./analytics";

let installationId = "";
let enabled = () => false;
const analyticsKey = Schema.decodeUnknownSync(
  Schema.Union([Schema.String, Schema.Undefined])
)(process.env.EXPO_PUBLIC_POSTHOG_PROJECT_KEY);
const analytics = createNativeAnalytics({
  key: analyticsKey,
  enabled: () => enabled(),
  distinctId: () => installationId,
});
const send = async (
  event: NativeAnalyticsEvent,
  properties: NativeAnalyticsProperties = {}
): Promise<void> => {
  if (!enabled() || analyticsKey === undefined) {
    return;
  }
  try {
    if (installationId === "") {
      const key = "pcobooster.analytics.installation.v1";
      installationId = (await AsyncStorage.getItem(key)) ?? Crypto.randomUUID();
      await AsyncStorage.setItem(key, installationId);
    }
    await analytics.capture(event, properties);
  } catch {
    // Optional telemetry failures do not interrupt the user's workflow.
  }
};
export const initializeNativeAnalytics = async (
  isEnabled: () => boolean
): Promise<void> => {
  enabled = isEnabled;
  await send("app_opened");
};
export const captureNativeEvent = (
  event: NativeAnalyticsEvent,
  properties: NativeAnalyticsProperties = {}
): void => {
  void send(event, properties);
};
export const nativeErrorCode = (error: Error) =>
  error instanceof RpcError ? error.code : "UNKNOWN";
