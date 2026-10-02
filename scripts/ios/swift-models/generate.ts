/**
 * Generates the iOS app's Swift API models from the oRPC contracts. `bun run ios:models`
 * (`scripts/ios/generate-swift-models.ts`) writes the result into `PCOBoosterCore`, and
 * `scripts/ios/generate-swift-models.test.ts` fails when the committed files are stale.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import type { ContractNode, SourceModule } from "./contracts";
import { contractProcedures, loadSourceModules } from "./contracts";
import { buildContractModel } from "./model";
import type { GeneratedFile } from "./render";
import { renderSwiftFiles } from "./render";

export type { GeneratedFile } from "./render";
export { GENERATED_DIRECTORY } from "./render";

export const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../../..");

const ROUTER_MODULE = "packages/contracts/src/router.ts";
const ROUTER_EXPORT = "appContract";
const SHARED_TEMPLATE = path.join(import.meta.dirname, "Shared.template.swift");

/** The hand-written support code `Shared.swift` carries. */
export const readSharedSwift = (): string =>
  readFileSync(SHARED_TEMPLATE, "utf-8").trimEnd();

/** Renders the Swift files for a contract router and the modules that name its schemas. */
export const generateSwiftModelsFrom = (
  router: ContractNode,
  modules: readonly SourceModule[],
  sharedSwift: string
): GeneratedFile[] =>
  renderSwiftFiles(
    buildContractModel(contractProcedures(router), modules),
    sharedSwift
  );

/** Renders the Swift files for the repository's `appContract`. */
export const generateSwiftModels = async (): Promise<GeneratedFile[]> => {
  const modules = await loadSourceModules(REPOSITORY_ROOT);
  const routerModule = modules.find(
    (sourceModule) => sourceModule.path === ROUTER_MODULE
  );
  const router = routerModule?.exports.get(ROUTER_EXPORT);
  if (router?.kind !== "contract") {
    throw new Error(
      `${ROUTER_MODULE} does not export the ${ROUTER_EXPORT} router`
    );
  }
  return generateSwiftModelsFrom(router.node, modules, readSharedSwift());
};
