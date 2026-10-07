/**
 * The release ledger stored on a dedicated GitHub branch through the Git data API. Each event is
 * one commit whose parent is the head this run read; the branch ref only moves with
 * `force: false`, so a write against a head that changed is refused instead of overwriting it.
 *
 * The branch holds `ledger.json` (the header) and `events.jsonl`. It must already exist:
 * initializing it, protecting it against deletion and force pushes, and limiting its writers are
 * approval-gated provisioning steps (docs/ci-cd.md), never something this code does.
 * https://docs.github.com/en/rest/git
 */
import { createHash } from "node:crypto";

import { Schema } from "effect";

import type { Fetch } from "./asc";
import type { LedgerStore, RawLedger } from "./ci-ledger";

export const LEDGER_BRANCH = "ios-release-ledger";
const HEADER_FILE = "ledger.json";
const EVENTS_FILE = "events.jsonl";

export interface GitHubLedgerOptions {
  /** `GITHUB_API_URL`, normally https://api.github.com. */
  readonly api: string;
  /** `owner/name`. */
  readonly repository: string;
  readonly branch: string;
  /** A token that may read, and for writes advance, the ledger branch. Never printed. */
  readonly token: string;
  readonly fetch?: Fetch;
}

const RefSchema = Schema.Struct({
  object: Schema.Struct({ sha: Schema.String, type: Schema.Literal("commit") }),
});
const CommitSchema = Schema.Struct({
  sha: Schema.String,
  tree: Schema.Struct({ sha: Schema.String }),
});
const TreeSchema = Schema.Struct({
  truncated: Schema.Boolean,
  tree: Schema.Array(
    Schema.Struct({
      path: Schema.String,
      type: Schema.String,
      sha: Schema.String,
    })
  ),
});
const BlobSchema = Schema.Struct({
  sha: Schema.String,
  encoding: Schema.Literal("base64"),
  content: Schema.String,
});
const CreatedSchema = Schema.Struct({ sha: Schema.String });

const fromJson = Schema.fromJsonString;
const decodeRef = Schema.decodeUnknownSync(fromJson(RefSchema));
const decodeCommit = Schema.decodeUnknownSync(fromJson(CommitSchema));
const decodeTree = Schema.decodeUnknownSync(fromJson(TreeSchema));
const decodeBlob = Schema.decodeUnknownSync(fromJson(BlobSchema));
const decodeCreated = Schema.decodeUnknownSync(fromJson(CreatedSchema));

/** The writes this store makes through the Git data API. */
type GitWrite =
  | { readonly content: string; readonly encoding: "utf-8" }
  | {
      readonly base_tree: string;
      readonly tree: readonly {
        readonly path: string;
        readonly mode: "100644";
        readonly type: "blob";
        readonly sha: string;
      }[];
    }
  | {
      readonly message: string;
      readonly tree: string;
      readonly parents: readonly string[];
    }
  | { readonly sha: string; readonly force: false };

/** Git's object ID for a blob, to check the API returned the bytes the tree names. */
export const gitBlobSha = (bytes: Buffer): string =>
  createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");

/** Thrown when the branch moved since this run read it. Never retried automatically. */
export class LedgerConflictError extends Error {
  override name = "LedgerConflictError";
}

export const makeGitHubLedgerStore = ({
  api,
  repository,
  branch,
  token,
  fetch = globalThis.fetch,
}: GitHubLedgerOptions): LedgerStore => {
  const base = `${api}/repos/${repository}`;
  const request = async (
    method: "GET" | "POST" | "PATCH",
    path: string,
    body?: GitWrite
  ): Promise<{ status: number; text: string }> => {
    const headers = new Headers({
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
    });
    const init: RequestInit = { method, redirect: "error", headers };
    if (body !== undefined) {
      headers.set("content-type", "application/json");
      init.body = JSON.stringify(body);
    }
    const response = await fetch(`${base}${path}`, init);
    return { status: response.status, text: await response.text() };
  };
  /** The response body of a request that must succeed. */
  const ok = async (
    method: "GET" | "POST" | "PATCH",
    path: string,
    body?: GitWrite
  ): Promise<string> => {
    const { status, text } = await request(method, path, body);
    if (status < 200 || status >= 300) {
      throw new Error(
        `GitHub answered ${status} for ${method} ${path} on the release ledger.`
      );
    }
    return text;
  };

  const readBlob = async (sha: string): Promise<string> => {
    const blob = decodeBlob(await ok("GET", `/git/blobs/${sha}`));
    const bytes = Buffer.from(blob.content, "base64");
    if (blob.sha !== sha || gitBlobSha(bytes) !== sha) {
      throw new Error(`Ledger blob ${sha} does not match its contents.`);
    }
    return bytes.toString("utf-8");
  };

  const readAt = async (
    head: string
  ): Promise<RawLedger & { tree: string }> => {
    const commit = decodeCommit(await ok("GET", `/git/commits/${head}`));
    const tree = decodeTree(await ok("GET", `/git/trees/${commit.tree.sha}`));
    if (tree.truncated) {
      throw new Error("The release ledger tree is truncated.");
    }
    const file = (name: string): string => {
      const entry = tree.tree.find(
        (item) => item.path === name && item.type === "blob"
      );
      if (entry === undefined) {
        throw new Error(
          `The release ledger at ${head} has no ${name}; it was not initialized as approved.`
        );
      }
      return entry.sha;
    };
    const [headerText, eventsText] = await Promise.all([
      readBlob(file(HEADER_FILE)),
      readBlob(file(EVENTS_FILE)),
    ]);
    return { head, tree: commit.tree.sha, headerText, eventsText };
  };

  const currentHead = async (): Promise<string> => {
    const { status, text } = await request("GET", `/git/ref/heads/${branch}`);
    if (status === 404) {
      throw new Error(
        `The release ledger branch ${branch} does not exist. Creating it is an approved provisioning step; it is never treated as an empty ledger.`
      );
    }
    if (status !== 200) {
      throw new Error(`GitHub answered ${status} reading the ledger branch.`);
    }
    return decodeRef(text).object.sha;
  };

  return {
    read: async () => {
      const { head, headerText, eventsText } = await readAt(
        await currentHead()
      );
      return { head, headerText, eventsText };
    },
    advance: async (parent, eventsText, message) => {
      const before = await readAt(parent);
      if (!eventsText.startsWith(before.eventsText)) {
        throw new Error("The release ledger only appends; refusing a rewrite.");
      }
      const blob = decodeCreated(
        await ok("POST", "/git/blobs", {
          content: eventsText,
          encoding: "utf-8",
        })
      );
      const tree = decodeCreated(
        await ok("POST", "/git/trees", {
          base_tree: before.tree,
          tree: [
            { path: EVENTS_FILE, mode: "100644", type: "blob", sha: blob.sha },
          ],
        })
      );
      const commit = decodeCreated(
        await ok("POST", "/git/commits", {
          message,
          tree: tree.sha,
          parents: [parent],
        })
      );
      // A ref update that is not a fast-forward from `parent` is refused (422), never forced.
      const { status } = await request("PATCH", `/git/refs/heads/${branch}`, {
        sha: commit.sha,
        force: false,
      });
      if (status === 422 || status === 409) {
        throw new LedgerConflictError(
          `The release ledger moved past ${parent} while this run held it; nothing was overwritten. Reconcile before another release.`
        );
      }
      if (status !== 200) {
        throw new Error(
          `GitHub answered ${status} advancing the release ledger; its state is unknown until reread.`
        );
      }
      return commit.sha;
    },
  };
};
