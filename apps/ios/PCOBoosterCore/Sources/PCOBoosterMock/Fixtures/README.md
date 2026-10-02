Fictional API responses for previews, UI tests, and App Store screenshots, one file per
procedure (`<namespace>.<procedure>.json`, `health.json` for the top-level procedure):

    {"default": <output>, "cases": [{"match": <subset of the input JSON>, "output": <output>}]}

`MockTransport` answers with the first case whose `match` is a subset of the request input,
else `default`. Every date is written around Sunday, October 4, 2026 (America/Los_Angeles), and
moved by whole weeks to the coming Sunday when served.

Generated, never edited by hand: change the typed data in `scripts/ios/fixtures/` and run
`bunx vitest run scripts/ios/fixtures.test.ts -u`. The test validates every output against the
contract's output schema and every `match` against its input schema.
