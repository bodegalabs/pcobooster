// Hermes lacks the ES2023 copying array methods the shared packages use (`toSorted` in
// planning-center-models, for example), so they are installed before any app module runs.
import "core-js/actual/array/to-reversed";
import "core-js/actual/array/to-sorted";
import "core-js/actual/array/to-spliced";
import "core-js/actual/array/with";
import "expo-router/entry";
