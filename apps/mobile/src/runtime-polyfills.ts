// Hermes lacks the ES2023 copying array methods the shared packages use (`toSorted` in
// planning-center-models, for example). `index.ts` imports this before any app module runs, and
// the Release Hermes gate (`scripts/hermes-gate`) imports it before the contracts it checks.
import "core-js/actual/array/to-reversed";
import "core-js/actual/array/to-sorted";
import "core-js/actual/array/to-spliced";
import "core-js/actual/array/with";
