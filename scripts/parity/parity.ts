/**
 * Parity suites pin the iOS app's Swift ports to the TypeScript they port. A suite names a
 * list of inputs and the TypeScript function that produces each expected output; register it
 * in `scripts/parity/suites.ts`. `parity.test.ts` writes every suite to
 * `apps/ios/PCOBoosterCore/Tests/PCOBoosterCoreTests/Fixtures/parity/<name>.json` with
 * `toMatchFileSnapshot`, and the Swift tests replay the same cases. `bun run ci` fails when the
 * TypeScript output changes until the fixtures are regenerated (`bun run parity:update`) and
 * the Swift port matches them again.
 *
 * Inputs and outputs must be plain JSON data: objects, arrays, strings, finite numbers,
 * booleans, `null`, and `Date` (written as `toISOString()`). Object keys keep insertion order,
 * `undefined` properties are dropped, and `Map`/`Set` are not supported (convert them first).
 */
export interface ParitySuite {
  /** Fixture file name, `<module>.<function>`, for example `calendar.dayKey`. */
  readonly name: string;
  /** The fixture file contents. */
  readonly render: () => string;
}

interface ParityCase<Input, Output> {
  readonly input: Input;
  readonly output: Output;
}

interface ParitySuiteSpec<Input, Output> {
  readonly name: string;
  readonly cases: readonly Input[];
  readonly run: (input: Input) => Output;
}

const LONG_DASHES = /[–—]/gu;

/** En and em dashes are escaped so the repo's long-dash lint passes; Swift decodes them back. */
const escapeLongDashes = (dash: string): string =>
  `\\u${(dash.codePointAt(0) ?? 0).toString(16).padStart(4, "0")}`;

const evaluate = <Input, Output>(
  spec: ParitySuiteSpec<Input, Output>
): readonly ParityCase<Input, Output>[] =>
  spec.cases.map((input) => ({ input, output: spec.run(input) }));

export const defineParitySuite = <Input, Output>(
  spec: ParitySuiteSpec<Input, Output>
): ParitySuite => ({
  name: spec.name,
  render: () =>
    `${JSON.stringify(
      { suite: spec.name, cases: evaluate(spec) },
      null,
      2
    ).replaceAll(LONG_DASHES, escapeLongDashes)}\n`,
});
