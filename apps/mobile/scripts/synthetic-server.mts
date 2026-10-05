import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
/** Local fictional transport. Never contacts Planning Center or uses real credentials. */
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";

import { makeRpcError } from "@pcobooster/client/testing";
import { Schema } from "effect";

const inputSchema = Schema.Record(Schema.String, Schema.Unknown);
const fixtureSchema = Schema.Struct({
  default: Schema.Json,
  cases: Schema.optional(
    Schema.Array(Schema.Struct({ match: inputSchema, output: Schema.Json }))
  ),
});
const messageSchema = Schema.Struct({
  _tag: Schema.Literal("Request"),
  id: Schema.Union([Schema.String, Schema.Number]),
  tag: Schema.String,
  payload: inputSchema,
});
const fixtures = new Map<string, typeof fixtureSchema.Type>();
const calls: string[] = [];
const cancelled: string[] = [];
const challenges = new Map<string, string>();
const controlsSchema = Schema.Struct({
  expire: Schema.optional(Schema.Boolean),
  denyServices: Schema.optional(Schema.Boolean),
  failOnceTag: Schema.optional(Schema.String),
  delayTag: Schema.optional(Schema.String),
  delayMs: Schema.optional(Schema.Number),
});
let controls: typeof controlsSchema.Type = {};
const readBody = async (
  request: IncomingMessage
): Promise<typeof Schema.Unknown.Type> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(
      Buffer.from(Schema.decodeUnknownSync(Schema.Uint8Array)(chunk))
    );
  }
  return JSON.parse(Buffer.concat(chunks).toString());
};
const state = new Map<string, typeof Schema.Json.Type>();
const session = {
  token: "synthetic-native-session",
  user: {
    id: "usr_9f3c2a7d1e",
    name: "Jordan Hale",
    email: "jordan.hale@cedargrove.example",
    image: null,
  },
  selectedAccountId: "acct_cedargrove",
};
const matches = (
  actual: typeof inputSchema.Type,
  expected: typeof inputSchema.Type
): boolean =>
  Object.entries(expected).every(
    ([key, value]) => JSON.stringify(actual[key]) === JSON.stringify(value)
  );
const readFixture = async (tag: string, payload: typeof inputSchema.Type) => {
  let fixture = fixtures.get(tag);
  if (fixture === undefined) {
    fixture = Schema.decodeUnknownSync(fixtureSchema)(
      JSON.parse(
        await readFile(
          new URL(`../src/fixtures/${tag}.json`, import.meta.url).pathname,
          "utf-8"
        )
      )
    );
    fixtures.set(tag, fixture);
  }
  return (
    fixture.cases?.find(({ match }) => matches(payload, match))?.output ??
    fixture.default
  );
};
const listKey = (tag: string, payload: typeof inputSchema.Type): string =>
  `${tag}:${JSON.stringify(payload.serviceTypeId ?? "")}:${JSON.stringify(payload.planId ?? payload.songId ?? "")}`;
const mutate = async (tag: string, payload: typeof inputSchema.Type) => {
  const [family] = tag.split(".");
  const listTag = `${family}.list`;
  if (family !== "planItems" && family !== "planTimes") {
    return await readFixture(tag, payload);
  }
  const key = listKey(listTag, payload);
  const rows = Schema.decodeUnknownSync(Schema.Array(inputSchema))(
    state.get(key) ?? (await readFixture(listTag, payload))
  );
  let changed = [...rows];
  if (tag.endsWith(".create")) {
    const output = Schema.decodeUnknownSync(inputSchema)(
      await readFixture(tag, payload)
    );
    const row = { ...output, ...payload, id: `synthetic-${Date.now()}` };
    changed.push(row);
    state.set(key, Schema.decodeUnknownSync(Schema.Json)(changed));
    return row;
  }
  const id = payload.itemId ?? payload.planTimeId ?? payload.timeId;
  if (tag.endsWith(".delete")) {
    changed = rows.filter((row) => row.id !== id);
  } else if (tag.endsWith(".update")) {
    changed = rows.map((row) => (row.id === id ? { ...row, ...payload } : row));
  } else if (
    tag.endsWith(".reorder") &&
    Schema.is(Schema.Array(Schema.String))(payload.sequence)
  ) {
    const ids = payload.sequence;
    changed.sort(
      (a, b) => ids.indexOf(String(a.id)) - ids.indexOf(String(b.id))
    );
  }
  state.set(key, Schema.decodeUnknownSync(Schema.Json)(changed));
  return await readFixture(tag, payload);
};
const handleAuth = async (
  url: URL,
  request: IncomingMessage,
  response: ServerResponse
): Promise<boolean> => {
  if (url.pathname === "/api/auth/native/start") {
    const callback = new URL(
      url.searchParams.get("redirect_uri") ?? "pcobooster-dev://auth/callback"
    );
    const code = randomUUID();
    challenges.set(code, url.searchParams.get("code_challenge") ?? "");
    callback.searchParams.set("code", code);
    callback.searchParams.set("state", url.searchParams.get("state") ?? "");
    response.writeHead(302, { location: callback.toString() });
    response.end();
    return true;
  }
  if (url.pathname === "/api/auth/native/exchange") {
    const input = Schema.decodeUnknownSync(
      Schema.Struct({ code: Schema.String, codeVerifier: Schema.String })
    )(await readBody(request));
    const challenge = challenges.get(input.code);
    challenges.delete(input.code);
    if (
      challenge !==
      createHash("sha256").update(input.codeVerifier).digest("base64url")
    ) {
      response.statusCode = 401;
      response.end("{}");
      return true;
    }
    process.stdout.write("native-pkce-verified\n");
    response.end(JSON.stringify(session));
    return true;
  }
  if (url.pathname === "/api/auth/sign-out") {
    response.end("{}");
    return true;
  }
  return false;
};
const handleRequest = async (
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1:3018");
  response.setHeader("content-type", "application/json");
  if (url.pathname === "/__fixture/abort-control") {
    response.on("close", () => {
      if (!response.writableFinished) {
        cancelled.push("fetch-control");
      }
    });
    await delay(120_000);
    response.end("{}");
    return;
  }
  if (url.pathname === "/__fixture/stats") {
    response.end(JSON.stringify({ calls, cancelled }));
    return;
  }
  if (url.pathname === "/__fixture/controls") {
    controls = Schema.decodeUnknownSync(controlsSchema)(
      await readBody(request)
    );
    response.end("{}");
    return;
  }
  if (await handleAuth(url, request, response)) {
    return;
  }
  try {
    const message = Schema.decodeUnknownSync(messageSchema)(
      await readBody(request)
    );
    if (controls.expire === true || controls.failOnceTag === message.tag) {
      const code = controls.expire === true ? "UNAUTHORIZED" : "BAD_GATEWAY";
      controls = { ...controls, failOnceTag: undefined };
      response.end(
        JSON.stringify([
          {
            _tag: "Exit",
            requestId: message.id,
            exit: {
              _tag: "Failure",
              cause: [{ _tag: "Fail", error: makeRpcError(code) }],
            },
          },
        ])
      );
      return;
    }
    calls.push(message.tag);
    process.stdout.write(`${message.tag}\n`);
    response.on("close", () => {
      if (!response.writableFinished) {
        cancelled.push(message.tag);
        process.stdout.write(`cancelled:${message.tag}\n`);
      }
    });
    if (controls.delayTag === message.tag) {
      await delay(controls.delayMs ?? 2000);
    }
    let value;
    if (message.tag === "session.status") {
      value = { authenticated: true };
    } else if (message.tag === "access.me" && controls.denyServices === true) {
      value = { services: { status: "none" }, people: { status: "granted" } };
    } else if (message.tag === "demo.start") {
      value = { demo: true, sessionToken: "synthetic-demo" };
    } else if (/\.(?:create|update|delete|reorder)$/u.test(message.tag)) {
      value = await mutate(message.tag, message.payload);
    } else {
      value =
        state.get(listKey(message.tag, message.payload)) ??
        (await readFixture(message.tag, message.payload));
    }
    response.end(
      JSON.stringify([
        {
          _tag: "Exit",
          requestId: message.id,
          exit: { _tag: "Success", value },
        },
      ])
    );
  } catch (error) {
    response.statusCode = 500;
    response.end(
      JSON.stringify({
        message:
          error instanceof Error ? error.message : "Synthetic fixture failed",
      })
    );
  }
};
const server = createServer((request, response) => {
  void handleRequest(request, response);
});
server.listen(3018, "127.0.0.1", () => {
  process.stdout.write("Fictional native fixture API http://127.0.0.1:3018\n");
});
