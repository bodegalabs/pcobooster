import * as Alchemy from "alchemy";
import { Config, Effect } from "effect";

const supportedStagePattern = /^(?:prod|staging|local|test|pr-\d+)$/u;

/** Where `alchemy dev` serves the API Worker. The stack test gets its own port. */
const localApiPort = 3000;
const testApiPort = 3010;

export interface StageSettings {
  readonly stage: string;
  readonly production: boolean;
  /**
   * True for stages that run on this machine under `alchemy dev`: `local`, and `test`, the API
   * stack test's stage (`worker.stack.test.ts`), which never shares `local`'s data or ports.
   */
  readonly local: boolean;
  /** The persistent pre-production stage, reachable only through Cloudflare Access. */
  readonly staging: boolean;
  /** The port `alchemy dev` serves the API Worker on. */
  readonly apiDevPort: number;
  /** The product's browser origin, which also serves the API and (outside production) admin. */
  readonly publicOrigin: string;
  /** Matches every preview and staging product Worker; they share production's OAuth callback. */
  readonly previewOriginPattern: string;
}

export const resolveStageSettings = (
  stage: string,
  workersSubdomain: string
): StageSettings => {
  if (!supportedStagePattern.test(stage)) {
    throw new Error(`Unsupported deployment stage: ${stage}`);
  }
  const production = stage === "prod";
  const local = stage === "local" || stage === "test";
  const apiDevPort = stage === "test" ? testApiPort : localApiPort;
  let publicOrigin = `https://pcobooster-${stage}-web.${workersSubdomain}.workers.dev`;
  if (production) {
    publicOrigin = "https://pcobooster.com";
  } else if (stage === "test") {
    publicOrigin = `http://127.0.0.1:${testApiPort}`;
  } else if (local) {
    publicOrigin = "http://127.0.0.1:3001";
  }
  return {
    stage,
    production,
    local,
    staging: stage === "staging",
    apiDevPort,
    publicOrigin,
    previewOriginPattern: `https://pcobooster-*-web.${workersSubdomain}.workers.dev`,
  };
};

/**
 * The current stage's settings. `Alchemy.Stack` carries the stage both while deploying and
 * inside a running Worker, so the stack and the API Worker derive identical values.
 */
export const currentStageSettings = Effect.gen(function* stageSettings() {
  const { stage } = yield* Alchemy.Stack;
  const workersSubdomain = yield* Config.String(
    "CLOUDFLARE_WORKERS_SUBDOMAIN"
  ).pipe(Config.withDefault("jakebodea"));
  return yield* Effect.try({
    try: () => resolveStageSettings(stage, workersSubdomain),
    catch: (error) =>
      error instanceof Error ? error : new Error(String(error)),
  }).pipe(Effect.orDie);
});
