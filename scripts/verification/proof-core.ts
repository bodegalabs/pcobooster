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
  /^(?:apps\/server\/|packages\/(?:api|contracts)\/|package\.json$|bun\.lock$|vercel\.json$)/u;
const mediumPath =
  /^(?:apps\/(?:web|marketing)\/|packages\/(?:planning-center-models|presentation-mode)\/|scripts\/|turbo\.json$|tsconfig\.json$)/u;
const visibleSurfacePath = /^apps\/(?:web|marketing)\/src\/.*\.(?:css|tsx)$/u;
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

export const requiresVisualEvidence = (paths: readonly string[]): boolean =>
  paths.some(
    (changedPath) =>
      visibleSurfacePath.test(changedPath) && !testPath.test(changedPath)
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
  status: z.enum(["pass", "fail"]),
});

export const proofReceiptSchema = z.object({
  artifacts: z.array(proofArtifactSchema),
  base: z.object({ ref: z.string().min(1), sha: z.string().min(1) }),
  changedFiles: z.array(z.string().min(1)).min(1),
  commands: z.array(proofCommandSchema).min(1),
  createdAt: z.iso.datetime(),
  flows: z.array(z.string().min(1)),
  headSha: z.string().min(1),
  notes: z.array(z.string().min(1)),
  patchId: z.string().min(1),
  requiresVisualEvidence: z.boolean(),
  riskTier: riskTierSchema,
  schemaVersion: z.literal(1),
  verdict: z.enum(verdicts),
});

export type ProofArtifact = z.infer<typeof proofArtifactSchema>;
export type ProofCommand = z.infer<typeof proofCommandSchema>;
export type ProofReceipt = z.infer<typeof proofReceiptSchema>;

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

const escapeCell = (value: string): string => value.replaceAll("|", "\\|");

export const renderProofReport = (receipt: ProofReceipt): string => {
  const commands = receipt.commands
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

### Limitations and notes

${notes}
`;
};
