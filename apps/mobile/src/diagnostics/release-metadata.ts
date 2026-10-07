/**
 * The installed build every report and API request names: the native version and build from the
 * bundle, and the source revision the release script stamps in at archive time
 * (`EXPO_PUBLIC_SOURCE_REVISION`, a full Git SHA). Builds made without it say `unknown`.
 */
import { Schema } from "effect";
import * as Application from "expo-application";
import { Platform } from "react-native";

import type { ReleaseMetadata } from "./diagnostics-client";

const REVISION = /^[\da-f]{7,40}$/u;

/** A Git SHA, or `unknown` for anything else. */
export const sourceRevision = (value: string | undefined): string =>
  value !== undefined && REVISION.test(value) ? value : "unknown";

export const releaseMetadata: ReleaseMetadata = {
  version: Application.nativeApplicationVersion ?? "0",
  build: Application.nativeBuildVersion ?? "0",
  revision: sourceRevision(
    Schema.decodeUnknownSync(Schema.String)(
      process.env.EXPO_PUBLIC_SOURCE_REVISION ?? ""
    )
  ),
  namespace: Application.applicationId ?? "unknown",
  osName: Platform.OS === "ios" ? "iOS" : Platform.OS,
  osVersion: String(Platform.Version),
};
