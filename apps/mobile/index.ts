// The order is the point (`src/diagnostics/startup-order.test.ts` holds it):
// 1. The fatal sentinel, which imports nothing, chains React Native's error handler first, so
//    every later failure, the polyfills' included, reaches it.
// 2. Hermes lacks the ES2023 copying array methods the shared packages use (`toSorted` in
//    planning-center-models, for example), so they are installed before any app module runs.
// 3. Diagnostics connects to the sentinel before the router or any screen module evaluates.
import "./src/diagnostics/fatal-sentinel";
import "core-js/actual/array/to-reversed";
import "core-js/actual/array/to-sorted";
import "core-js/actual/array/to-spliced";
import "core-js/actual/array/with";
import "./src/diagnostics/device-diagnostics";
import "expo-router/entry";
