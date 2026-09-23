import { createHash } from "node:crypto";
import path from "node:path";

import { z } from "zod";

export const riskTiers = ["low", "medium", "high", "critical"] as const;
export type RiskTier = (typeof riskTiers)[number];
export const riskTierSchema = z.enum(riskTiers);

export const verdicts = ["PASS", "PASS_WITH_NOTES", "FAIL", "BLOCKED"] as const;
export type Verdict = (typeof verdicts)[number];

const riskRank: Record<RiskTier, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

const criticalPath =
  /^(?:\.github\/workflows\/|apps\/web\/src\/proxy\.ts$|packages\/api\/(?:migrations\/|src\/(?:auth\/|db\/)))/u;
const highPath =
  /^(?:apps\/server\/|packages\/(?:api|contracts)\/|package\.json$|bun\.lock$|alchemy\.run\.ts$|patches\/|scripts\/(?:cloudflare|database)\/)/u;
const mediumPath =
  /^(?:apps\/(?:web|marketing)\/|packages\/(?:planning-center-models|presentation-mode)\/|scripts\/|turbo\.json$|tsconfig\.json$)/u;
const visibleSourcePath =
  /^apps\/(?:web|marketing)\/src\/.*\.(?:css|gif|ico|jpeg|jpg|png|svg|tsx|webmanifest|webp)$/u;
const publicAssetPath = /^apps\/(?:web|marketing)\/public\//u;
const testPath = /(?:^|\/)\S+\.test\.[cm]?[jt]sx?$/u;

export const classifyPath = (changedPath: string): RiskTier => {
  if (criticalPath.test(changedPath)) {
    return "critical";
  }
  if (highPath.test(changedPath)) {
    return "high";
  }
  if (mediumPath.test(changedPath)) {
    return "medium";
  }
  return "low";
};

export const classifyChangedFiles = (paths: readonly string[]): RiskTier => {
  let highest: RiskTier = "low";
  for (const changedPath of paths) {
    const candidate = classifyPath(changedPath);
    if (riskRank[candidate] > riskRank[highest]) {
      highest = candidate;
    }
  }
  return highest;
};

export const maxRiskTier = (first: RiskTier, second: RiskTier): RiskTier =>
  riskRank[first] >= riskRank[second] ? first : second;

export const requiresVisualEvidence = (paths: readonly string[]): boolean =>
  paths.some(
    (changedPath) =>
      (visibleSourcePath.test(changedPath) ||
        publicAssetPath.test(changedPath)) &&
      !testPath.test(changedPath)
  );

const artifactKindSchema = z.enum(["image", "video"]);

export const proofArtifactSchema = z.object({
  alt: z.string().min(1),
  kind: artifactKindSchema,
  path: z.string().min(1),
  sha256: z.string().regex(/^[a-f\d]{64}$/u),
});

export const proofCommandSchema = z.object({
  command: z.string().min(1),
  durationMs: z.number().nonnegative(),
  exitCode: z.number().int(),
  logPath: z.string().min(1),
  name: z.string().min(1),
  sha256: z.string().regex(/^[a-f\d]{64}$/u),
  status: z.enum(["pass", "fail"]),
});

export const independentVerificationSchema = z.object({
  source: z.string().min(1),
  summary: z.string().min(1),
  verdict: z.enum(["PASS", "PASS_WITH_NOTES"]),
});

export const proofReceiptSchema = z.object({
  artifacts: z.array(proofArtifactSchema),
  base: z.object({ ref: z.string().min(1), sha: z.string().min(1) }),
  changedFiles: z.array(z.string().min(1)).min(1),
  commands: z.array(proofCommandSchema).min(1),
  createdAt: z.iso.datetime(),
  flows: z.array(z.string().min(1)),
  focusedChecks: z.array(proofCommandSchema),
  headSha: z.string().min(1),
  independentVerification: independentVerificationSchema.nullable(),
  notes: z.array(z.string().min(1)),
  patchId: z.string().min(1),
  requiresVisualEvidence: z.boolean(),
  riskTier: riskTierSchema,
  rollback: z.string().min(1).nullable(),
  schemaVersion: z.literal(1),
  verdict: z.enum(verdicts),
});

export type ProofArtifact = z.infer<typeof proofArtifactSchema>;
export type ProofCommand = z.infer<typeof proofCommandSchema>;
export type ProofReceipt = z.infer<typeof proofReceiptSchema>;

export const expectedCommandNames = (
  riskTier: RiskTier,
  ciPassed: boolean
): string[] => (riskTier === "low" || !ciPassed ? ["ci"] : ["ci", "build"]);

export const deriveVerdict = (
  receipt: Pick<
    ProofReceipt,
    | "artifacts"
    | "commands"
    | "focusedChecks"
    | "independentVerification"
    | "notes"
    | "requiresVisualEvidence"
    | "riskTier"
    | "rollback"
  >
): Verdict => {
  if (
    [...receipt.commands, ...receipt.focusedChecks].some(
      (command) => command.status === "fail"
    )
  ) {
    return "FAIL";
  }
  if (receipt.requiresVisualEvidence && receipt.artifacts.length === 0) {
    return "BLOCKED";
  }
  if (
    (receipt.riskTier === "high" || receipt.riskTier === "critical") &&
    receipt.independentVerification === null
  ) {
    return "BLOCKED";
  }
  if (receipt.riskTier === "critical" && receipt.rollback === null) {
    return "BLOCKED";
  }
  if (receipt.riskTier === "critical" && receipt.focusedChecks.length === 0) {
    return "BLOCKED";
  }
  if (
    receipt.notes.length > 0 ||
    receipt.independentVerification?.verdict === "PASS_WITH_NOTES"
  ) {
    return "PASS_WITH_NOTES";
  }
  return "PASS";
};

const arraysEqual = (first: readonly string[], second: readonly string[]) =>
  first.length === second.length &&
  first.every((value, index) => value === second[index]);

export interface ReceiptFacts {
  changedFiles: string[];
  minimumRiskTier: RiskTier;
  requiresVisualEvidence: boolean;
}

export const validateReceiptSemantics = (
  receipt: ProofReceipt,
  facts: ReceiptFacts
): string[] => {
  const violations: string[] = [];
  if (!arraysEqual(receipt.changedFiles, facts.changedFiles)) {
    violations.push("changed files do not match the proved revision");
  }
  if (
    maxRiskTier(receipt.riskTier, facts.minimumRiskTier) !== receipt.riskTier
  ) {
    violations.push("risk tier is lower than the changed paths require");
  }
  if (receipt.requiresVisualEvidence !== facts.requiresVisualEvidence) {
    violations.push("visual-evidence requirement does not match changed paths");
  }
  const ciPassed = receipt.commands[0]?.status === "pass";
  const commandNames = receipt.commands.map((command) => command.name);
  if (
    !arraysEqual(commandNames, expectedCommandNames(receipt.riskTier, ciPassed))
  ) {
    violations.push("recorded gates do not match the risk tier and CI result");
  }
  for (const command of receipt.commands) {
    const expectedCommand =
      command.name === "ci" ? "bun run ci" : "bun run build";
    if (command.command !== expectedCommand) {
      violations.push(`${command.name} command is not the canonical gate`);
    }
    if ((command.exitCode === 0) !== (command.status === "pass")) {
      violations.push(`${command.name} status contradicts its exit code`);
    }
  }
  for (const command of receipt.focusedChecks) {
    if ((command.exitCode === 0) !== (command.status === "pass")) {
      violations.push(`${command.name} status contradicts its exit code`);
    }
  }
  if (receipt.verdict !== deriveVerdict(receipt)) {
    violations.push("verdict contradicts the recorded evidence");
  }
  return violations;
};

export const sha256 = (contents: Uint8Array): string =>
  createHash("sha256").update(contents).digest("hex");

export const artifactKindForPath = (
  artifactPath: string
): "image" | "video" => {
  const extension = path.extname(artifactPath).toLowerCase();
  if ([".mp4", ".mov", ".webm"].includes(extension)) {
    return "video";
  }
  if ([".gif", ".jpeg", ".jpg", ".png", ".webp"].includes(extension)) {
    return "image";
  }
  throw new Error(`Proof artifact must be an image or video: ${artifactPath}`);
};

export const githubAttachmentArgument = (
  artifactPath: string,
  artifact: Pick<ProofArtifact, "alt" | "kind">
): string =>
  artifact.kind === "image" ? `${artifactPath}#${artifact.alt}` : artifactPath;

const escapeCell = (value: string): string => value.replaceAll("|", "\\|");

export const renderProofReport = (receipt: ProofReceipt): string => {
  const commands = [...receipt.commands, ...receipt.focusedChecks]
    .map(
      (command) =>
        `| ${escapeCell(command.name)} | ${command.status} | \`${escapeCell(command.command)}\` | ${command.durationMs} ms |`
    )
    .join("\n");
  const artifacts =
    receipt.artifacts.length === 0
      ? "- None required or captured."
      : receipt.artifacts
          .map(
            (artifact) =>
              `- ${artifact.kind}: ${artifact.alt} (SHA-256 \`${artifact.sha256}\`)`
          )
          .join("\n");
  const flows =
    receipt.flows.length === 0
      ? "- No interactive flow was claimed."
      : receipt.flows.map((flow) => `- ${flow}`).join("\n");
  const notes =
    receipt.notes.length === 0
      ? "- None."
      : receipt.notes.map((note) => `- ${note}`).join("\n");
  const independentVerification = receipt.independentVerification
    ? `- ${receipt.independentVerification.verdict} by ${receipt.independentVerification.source}: ${receipt.independentVerification.summary}`
    : "- Not recorded.";
  const rollback = receipt.rollback ?? "Not required or not recorded.";

  return `<!-- proofed-delivery:${receipt.headSha} -->
## Verification proof: ${receipt.verdict}

Bound to head \`${receipt.headSha}\`, base \`${receipt.base.sha}\`, and stable patch \`${receipt.patchId}\`.

Risk: **${receipt.riskTier}**${receipt.requiresVisualEvidence ? " · visual evidence required" : ""}

| Gate | Result | Command | Duration |
| --- | --- | --- | --- |
${commands}

### Verified flows

${flows}

### Evidence

${artifacts}

### Independent verification

${independentVerification}

### Rollback

${rollback}

### Limitations and notes

${notes}
`;
};
