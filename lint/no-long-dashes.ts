import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const DASHES = /[\u2013\u2014]/g;
const decoder = new TextDecoder("utf-8", { fatal: true });

export interface DashViolation {
  path: string;
  line: number;
  column: number;
}

export const findLongDashes = (
  path: string,
  content: string
): DashViolation[] => {
  const violations: DashViolation[] = [];
  for (const match of content.matchAll(DASHES)) {
    const before = content.slice(0, match.index);
    const lines = before.split("\n");
    violations.push({
      path,
      line: lines.length,
      column: (lines.at(-1)?.length ?? 0) + 1,
    });
  }
  return violations;
};

const trackedPaths = (): string[] => {
  const output = execFileSync("git", ["ls-files", "--cached", "-z"]);
  return decoder.decode(output).split("\0").filter(Boolean);
};

export const checkTrackedFiles = async (): Promise<DashViolation[]> => {
  const violations: DashViolation[] = [];
  for (const path of trackedPaths()) {
    const bytes = await readFile(path);
    if (bytes.includes(0)) {
      continue;
    }
    try {
      violations.push(...findLongDashes(path, decoder.decode(bytes)));
    } catch (error) {
      if (error instanceof TypeError) {
        continue;
      }
      throw error;
    }
  }
  return violations;
};

if (import.meta.main) {
  const violations = await checkTrackedFiles();
  for (const { path, line, column } of violations) {
    process.stderr.write(
      `${path}:${line}:${column}: em and en dashes are not allowed\n`
    );
  }
  if (violations.length > 0) {
    process.exitCode = 1;
  }
}
