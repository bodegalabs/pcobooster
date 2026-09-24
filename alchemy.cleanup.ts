/**
 * Teardown for pull request stages. It shares the application stack's name and state but
 * declares no resources, so destroying a stage needs only Cloudflare credentials: no app
 * secrets, no build, and no dependence on configuration that `main` added after the PR opened.
 */
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { Effect, Layer } from "effect";

import { isPreviewStage } from "./scripts/cloudflare/stages";

const previewState = Layer.unwrap(
  Alchemy.Stage.pipe(
    Effect.flatMap((stage) =>
      isPreviewStage(stage)
        ? Effect.succeed(Cloudflare.state())
        : Effect.die(
            new Error(`Cleanup only removes pr-<number> stages: ${stage}`)
          )
    )
  )
);

export default Alchemy.Stack(
  "pcobooster",
  { providers: Cloudflare.providers(), state: previewState },
  Effect.succeed({})
);
