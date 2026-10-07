import { Schema } from "effect";
import type { Json } from "effect/Schema";
import { describe, expect, it } from "vitest";

import {
  encodeEvent,
  parseLedger,
  persistEvent,
  readLedger,
} from "../apps/mobile/scripts/release/ci-ledger";
import type {
  LedgerEvent,
  LedgerStore,
} from "../apps/mobile/scripts/release/ci-ledger";
import { runRelease } from "../apps/mobile/scripts/release/ci-release";
import {
  LedgerConflictError,
  gitBlobSha,
  makeGitHubLedgerStore,
} from "../apps/mobile/scripts/release/ledger-github";
import {
  AT,
  BUNDLE,
  HEADER,
  claimOf,
  harness,
  hex,
  identityFor,
  memoryLedger,
  requestOf,
  runOf,
} from "./testing/ios-release-fixtures";

const raw = (eventsText: string, headerText = HEADER) => ({
  head: "h",
  headerText,
  eventsText,
});

const parse = (events: readonly LedgerEvent[]) =>
  parseLedger(raw(events.map((event) => encodeEvent(event)).join("")), BUNDLE);

const verified: LedgerEvent = {
  build: 373,
  at: AT,
  run: runOf(),
  state: "verified",
  artifacts: identityFor(373),
  symbols: { clonedMapSha256: hex("c"), uploadedAt: AT },
};
const started: LedgerEvent = {
  build: 373,
  at: AT,
  run: runOf(),
  state: "upload_started",
  ipaSha256: hex("3"),
};

describe("reading the release ledger", () => {
  it("refuses unreadable lines and a partial last line", () => {
    expect(() => parseLedger(raw("not json\n"), BUNDLE)).toThrow(
      "line 1 is unreadable"
    );
    expect(() =>
      parseLedger(raw(encodeEvent(claimOf(373)).trimEnd()), BUNDLE)
    ).toThrow("partial line");
  });

  it("refuses a missing header or another app's ledger instead of reading it as empty", () => {
    expect(() => parseLedger(raw("", ""), BUNDLE)).toThrow(
      "refusing to treat it as empty"
    );
    expect(() => parseLedger(raw(""), "com.other.app")).toThrow(
      "belongs to com.pcobooster.ios"
    );
  });
});

describe("the ledger lifecycle", () => {
  it("accepts claimed, verified, upload_started from one run", () => {
    expect(parse([claimOf(373), verified, started]).records.size).toBe(1);
  });

  it("refuses skipped states and abandoning an upload of unknown outcome", () => {
    expect(() => parse([claimOf(373), started])).toThrow(
      "claimed and cannot become upload_started"
    );
    expect(() =>
      parse([
        claimOf(373),
        verified,
        started,
        { build: 373, at: AT, run: runOf(), state: "abandoned", reason: "x" },
      ])
    ).toThrow("upload_started and cannot become abandoned");
  });

  it("refuses another run advancing a claim, or uploading an IPA it did not verify", () => {
    expect(() =>
      parse([claimOf(373), { ...verified, run: runOf("2002") }])
    ).toThrow("belongs to run 1001");
    expect(() =>
      parse([claimOf(373), verified, { ...started, ipaSha256: hex("e") }])
    ).toThrow("an IPA other than the one it verified");
  });

  it("only claims upward, once per run", () => {
    expect(() => parse([claimOf(374), claimOf(373, "2002")])).toThrow(
      "not above ledger build 374"
    );
    expect(() => parse([claimOf(373), claimOf(374)])).toThrow(
      "run 1001 already claimed a build"
    );
  });

  it("refuses to treat a write as durable unless rereading shows it", async () => {
    const ledger = memoryLedger();
    const lying: LedgerStore = {
      read: ledger.store.read,
      advance: async () => await Promise.resolve("commit-that-never-landed"),
    };
    await expect(
      persistEvent(lying, await readLedger(lying, BUNDLE), claimOf(373))
    ).rejects.toThrow("did not durably record build 373 claimed");
  });
});

const BlobWrite = Schema.Struct({ content: Schema.String });
const TreeWrite = Schema.Struct({
  base_tree: Schema.String,
  tree: Schema.Array(
    Schema.Struct({ path: Schema.String, sha: Schema.String })
  ),
});
const CommitWrite = Schema.Struct({
  tree: Schema.String,
  parents: Schema.Array(Schema.String),
});
const RefWrite = Schema.Struct({ sha: Schema.String, force: Schema.Boolean });
const decodeBlobWrite = Schema.decodeUnknownSync(
  Schema.fromJsonString(BlobWrite)
);
const decodeTreeWrite = Schema.decodeUnknownSync(
  Schema.fromJsonString(TreeWrite)
);
const decodeCommitWrite = Schema.decodeUnknownSync(
  Schema.fromJsonString(CommitWrite)
);
const decodeRefWrite = Schema.decodeUnknownSync(
  Schema.fromJsonString(RefWrite)
);

const json = (value: Json, status = 200) => Response.json(value, { status });
const BRANCH = "ios-release-ledger";
type Route = (key: string, body: string) => Response;

/** An in-memory Git data API for one repository, enforcing GitHub's non-force ref update. */
const fakeGitHub = (initialized = true) => {
  const blobs = new Map<string, string>();
  const trees = new Map<string, Map<string, string>>();
  const commits = new Map<
    string,
    { tree: string; parents: readonly string[] }
  >();
  const refs = new Map<string, string>();
  const requests: { method: string; route: string; body: string }[] = [];
  let counter = 0;
  const id = (prefix: string) => {
    counter += 1;
    return `${prefix}${String(counter).padStart(39, "0")}`;
  };
  const putBlob = (content: string) => {
    const sha = gitBlobSha(Buffer.from(content));
    blobs.set(sha, content);
    return sha;
  };
  if (initialized) {
    const tree = id("t");
    trees.set(
      tree,
      new Map([
        ["ledger.json", putBlob(HEADER)],
        ["events.jsonl", putBlob("")],
      ])
    );
    const commit = id("c");
    commits.set(commit, { tree, parents: [] });
    refs.set(BRANCH, commit);
  }
  const routes = {
    "GET ref": (key) => {
      const sha = refs.get(key.replace("heads/", ""));
      return sha === undefined
        ? json({ message: "Not Found" }, 404)
        : json({ object: { sha, type: "commit" } });
    },
    "GET commits": (key) => {
      const commit = commits.get(key);
      return commit === undefined
        ? json({}, 404)
        : json({ sha: key, tree: { sha: commit.tree } });
    },
    "GET trees": (key) =>
      json({
        truncated: false,
        tree: [...(trees.get(key) ?? new Map<string, string>())].map(
          ([name, sha]) => ({ path: name, type: "blob", sha })
        ),
      }),
    "GET blobs": (key) =>
      json({
        sha: key,
        encoding: "base64",
        content: Buffer.from(blobs.get(key) ?? "").toString("base64"),
      }),
    "POST blobs": (_key, body) =>
      json({ sha: putBlob(decodeBlobWrite(body).content) }, 201),
    "POST trees": (_key, body) => {
      const write = decodeTreeWrite(body);
      const tree = id("t");
      const entries = new Map(trees.get(write.base_tree));
      for (const entry of write.tree) {
        entries.set(entry.path, entry.sha);
      }
      trees.set(tree, entries);
      return json({ sha: tree }, 201);
    },
    "POST commits": (_key, body) => {
      const write = decodeCommitWrite(body);
      const commit = id("c");
      commits.set(commit, { tree: write.tree, parents: write.parents });
      return json({ sha: commit }, 201);
    },
    "PATCH refs": (key, body) => {
      const write = decodeRefWrite(body);
      const branch = key.replace("heads/", "");
      const parents = commits.get(write.sha)?.parents ?? [];
      if (write.force || !parents.includes(refs.get(branch) ?? "")) {
        return json({ message: "Update is not a fast forward" }, 422);
      }
      refs.set(branch, write.sha);
      return json({ object: { sha: write.sha } });
    },
  } satisfies Record<string, Route>;
  const isRoute = (key: string): key is keyof typeof routes =>
    Object.hasOwn(routes, key);
  const fetch = async (input: string, init?: RequestInit) => {
    const request = new Request(input, init);
    const body = await request.text();
    const route = new URL(request.url).pathname.replace(
      "/repos/bodegalabs/pcobooster/git/",
      ""
    );
    requests.push({ method: request.method, route, body });
    const [kind = "", ...rest] = route.split("/");
    const key = `${request.method} ${kind}`;
    return isRoute(key) ? routes[key](rest.join("/"), body) : json({}, 404);
  };
  const store = makeGitHubLedgerStore({
    api: "https://api.github.com",
    repository: "bodegalabs/pcobooster",
    branch: BRANCH,
    token: "test-token",
    fetch,
  });
  return { store, requests, refs, blobs };
};

describe("the GitHub ledger branch", () => {
  it("records a whole release as child commits on the branch", async () => {
    const github = fakeGitHub();
    await runRelease(harness(github.store).deps, requestOf());
    const ledger = await readLedger(github.store, BUNDLE);
    expect(ledger.events.map((event) => event.state)).toStrictEqual([
      "claimed",
      "verified",
      "upload_started",
      "upload_accepted",
    ]);
  });

  it("advances the branch only with non-force ref updates", async () => {
    const github = fakeGitHub();
    await runRelease(harness(github.store).deps, requestOf());
    const updates = github.requests
      .filter((request) => request.method === "PATCH")
      .map((request) => decodeRefWrite(request.body).force);
    expect(updates).toStrictEqual([false, false, false, false]);
  });

  it("refuses a write against a head that moved, overwriting nothing", async () => {
    const github = fakeGitHub();
    const stale = await readLedger(github.store, BUNDLE);
    await persistEvent(github.store, stale, claimOf(373));
    const kept = github.refs.get(BRANCH);
    await expect(
      persistEvent(github.store, stale, claimOf(374, "2002"))
    ).rejects.toThrow(LedgerConflictError);
    expect(github.refs.get(BRANCH)).toBe(kept);
  });

  it("treats a missing branch as an error, never an empty ledger", async () => {
    await expect(readLedger(fakeGitHub(false).store, BUNDLE)).rejects.toThrow(
      "approved provisioning step"
    );
  });

  it("refuses blobs whose contents do not match their Git object IDs", async () => {
    const github = fakeGitHub();
    for (const sha of github.blobs.keys()) {
      github.blobs.set(sha, "tampered");
    }
    await expect(readLedger(github.store, BUNDLE)).rejects.toThrow(
      "does not match its contents"
    );
  });
});
