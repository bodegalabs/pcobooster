/**
 * Expo's default Metro config plus PostHog's chunk-ID serializer: every bundle gets a debug ID
 * (`globalThis._posthogChunkIds` in the bundle, `chunkId` in its source map), which error
 * reports carry on each frame and PostHog matches to the uploaded Hermes source map
 * (`scripts/source-maps.ts`). Development bundles get one too; it is never sent from them.
 */
import { getPostHogExpoConfig } from "posthog-react-native/metro";

export default getPostHogExpoConfig(import.meta.dirname);
