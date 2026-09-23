import {
  createRequestContext,
  RequestContext,
} from "@pcobooster/api/application/context";
import { Forbidden } from "@pcobooster/api/application/errors/forbidden";
import { createApplicationRuntime } from "@pcobooster/api/application/runtime";
import { Cause, Context, Deferred, Effect, Exit, Layer, Option } from "effect";
import { describe, expect, it } from "vitest";

const requestContext = (requestId: string, signal?: AbortSignal) =>
  createRequestContext(
    new Request("https://pcobooster.com/api/rpc", {
      headers: {
        "x-request-id": requestId,
        authorization: `Bearer ${requestId}`,
      },
      signal,
    })
  );

describe("application runtime", () => {
  it("keeps concurrent request identities isolated across asynchronous work", async () => {
    const runtime = createApplicationRuntime(Layer.empty);
    const enteredFirst = await Effect.runPromise(Deferred.make<boolean>());
    const enteredSecond = await Effect.runPromise(Deferred.make<boolean>());
    const release = await Effect.runPromise(Deferred.make<boolean>());
    const readContext = (entered: Deferred.Deferred<boolean>) =>
      Effect.gen(function* readRequestContext() {
        const before = yield* RequestContext;
        yield* Deferred.succeed(entered, true);
        yield* Deferred.await(release);
        const after = yield* RequestContext;
        return {
          before: before.requestId,
          after: after.requestId,
          authorization: after.headers.get("authorization"),
        };
      });

    try {
      const first = runtime.execute(
        readContext(enteredFirst),
        requestContext("first")
      );
      const second = runtime.execute(
        readContext(enteredSecond),
        requestContext("second")
      );
      await Effect.runPromise(
        Effect.all([
          Deferred.await(enteredFirst),
          Deferred.await(enteredSecond),
        ])
      );
      await Effect.runPromise(Deferred.succeed(release, true));

      await expect(first).resolves.toStrictEqual(
        Exit.succeed({
          before: "first",
          after: "first",
          authorization: "Bearer first",
        })
      );
      await expect(second).resolves.toStrictEqual(
        Exit.succeed({
          before: "second",
          after: "second",
          authorization: "Bearer second",
        })
      );
    } finally {
      await runtime.dispose();
    }
  });

  it("preserves typed failures separately from defects", async () => {
    const runtime = createApplicationRuntime(Layer.empty);
    const fault = new Forbidden({ message: "Admin access required" });

    try {
      const result = await runtime.execute(
        Effect.fail(fault),
        requestContext("failure")
      );
      const failureCause = Option.getOrThrow(Exit.getCause(result));
      expect(Cause.findErrorOption(failureCause)).toStrictEqual(
        Option.some(fault)
      );
      expect(
        failureCause.reasons
          .filter(Cause.isDieReason)
          .map((reason) => reason.defect)
      ).toHaveLength(0);

      const defect = new Error("Unexpected invariant violation");
      const defectResult = await runtime.execute(
        Effect.die(defect),
        requestContext("defect")
      );
      const defectCause = Option.getOrThrow(Exit.getCause(defectResult));
      expect(Cause.findErrorOption(defectCause)).toStrictEqual(Option.none());
      expect(
        defectCause.reasons
          .filter(Cause.isDieReason)
          .map((reason) => reason.defect)
      ).toStrictEqual([defect]);
    } finally {
      await runtime.dispose();
    }
  });

  it("interrupts execution when the request is aborted", async () => {
    const runtime = createApplicationRuntime(Layer.empty);
    const controller = new AbortController();
    const entered = await Effect.runPromise(Deferred.make<boolean>());

    try {
      const pending = runtime.execute(
        Effect.andThen(Deferred.succeed(entered, true), Effect.never),
        requestContext("aborted", controller.signal)
      );
      await Effect.runPromise(Deferred.await(entered));
      controller.abort();
      const result = await pending;

      expect(
        Cause.hasInterruptsOnly(Option.getOrThrow(Exit.getCause(result)))
      ).toBeTruthy();
    } finally {
      await runtime.dispose();
    }
  });

  it("acquires shared resources once and releases them on disposal", async () => {
    class Resource extends Context.Service<Resource, string>()(
      "TestResource"
    ) {}
    const events: string[] = [];
    const layer = Layer.effect(
      Resource,
      Effect.acquireRelease(
        Effect.sync(() => {
          events.push("acquire");
          return "resource";
        }),
        () =>
          Effect.sync(() => {
            events.push("release");
          })
      )
    );
    const runtime = createApplicationRuntime(layer);

    try {
      await expect(
        runtime.execute(Resource, requestContext("first"))
      ).resolves.toStrictEqual(Exit.succeed("resource"));
      await expect(
        runtime.execute(Resource, requestContext("second"))
      ).resolves.toStrictEqual(Exit.succeed("resource"));
      expect(events).toStrictEqual(["acquire"]);
    } finally {
      await runtime.dispose();
    }

    expect(events).toStrictEqual(["acquire", "release"]);
  });
});
