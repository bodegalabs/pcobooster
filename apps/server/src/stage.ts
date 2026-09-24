import * as Alchemy from "alchemy";
import { Config, Effect } from "effect";

const supportedStagePattern = /^(?:prod|local|pr-\d+)$/u;

export interface StageSettings {
  readonly stage: string;
  readonly production: boolean;
  readonly local: boolean;
  /** The product's browser origin, which also serves the API and (outside production) admin. */
  readonly publicOrigin: string;
  /** Matches every preview product Worker; they share production's OAuth callback. */
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
  const local = stage === "local";
  let publicOrigin = `https://pcobooster-${stage}-web.${workersSubdomain}.workers.dev`;
  if (production) {
    publicOrigin = "https://pcobooster.com";
  } else if (local) {
    publicOrigin = "http://127.0.0.1:3001";
  }
  return {
    stage,
    production,
    local,
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
