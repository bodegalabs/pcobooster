import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

import { describe, expect, it, onTestFinished } from "vitest";

import { iosBuildNumber } from "../apps/mobile/scripts/build-number";

describe("iOS build number", () => {
  it("defaults local native generation to build 1", () => {
    expect(iosBuildNumber()).toBe("1");
  });

  it("preserves explicit release numbers as strings", () => {
    expect(iosBuildNumber("293")).toBe("293");
    expect(iosBuildNumber("370")).toBe("370");
  });

  it.each(["", "0", "-1", "01", "1.2", "1e3", " 293", "293\n"])(
    "refuses invalid native build number %j",
    (value) => {
      expect(() => iosBuildNumber(value)).toThrow("BUILD_NUMBER");
    }
  );
});

const mobile = path.join(import.meta.dirname, "../apps/mobile");

/**
 * A committed throwaway checkout holding just the release script and its CLI, so the script's
 * refusals run for real without touching this checkout, Xcode, or App Store Connect.
 */
const releaseCheckout = () => {
  const root = mkdtempSync(path.join(tmpdir(), "pcob-release-script-"));
  onTestFinished(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const scripts = path.join(root, "apps/mobile/scripts");
  mkdirSync(scripts, { recursive: true });
  cpSync(
    path.join(mobile, "scripts/release-ios.sh"),
    path.join(scripts, "release-ios.sh")
  );
  cpSync(path.join(mobile, "scripts/release"), path.join(scripts, "release"), {
    recursive: true,
  });
  symlinkSync(
    path.join(mobile, "node_modules"),
    path.join(root, "apps/mobile/node_modules")
  );
  writeFileSync(path.join(root, ".gitignore"), "node_modules\n");
  const git = (...args: string[]) =>
    spawnSync("git", ["-C", root, ...args], { encoding: "utf-8" });
  git("init", "-q");
  git("add", "-A");
  git(
    "-c",
    "user.email=t@example.com",
    "-c",
    "user.name=t",
    "commit",
    "-qm",
    "init"
  );
  // Outside the checkout, which must stay clean.
  const state = `${root}-state`;
  onTestFinished(() => {
    rmSync(state, { recursive: true, force: true });
  });
  const release = (
    env: Record<string, string | undefined>,
    args = ["--no-upload"]
  ) =>
    spawnSync("bash", [path.join(scripts, "release-ios.sh"), ...args], {
      encoding: "utf-8",
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        TMPDIR: tmpdir(),
        PCOB_RELEASE_STATE_DIR: state,
        ...env,
      },
    });
  return { release, state };
};

describe("release-ios.sh before it builds", () => {
  it.each([
    {},
    {
      CI: "1",
      GITHUB_ACTIONS: "true",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_WORKFLOW: "iOS release preparation",
    },
  ])("cannot enable a local upload with environment markers (%j)", (env) => {
    const { release } = releaseCheckout();
    const result = release(env, ["--upload"]);
    expect(result.status).toBe(64);
    expect(result.stderr).toContain("BLOCKED: uploads belong");
  });

  it("the sole workflow is manually dispatched, serialized app-wide, and has no enabled uploader or credential reader", () => {
    const workflow = readFileSync(
      path.join(import.meta.dirname, "../.github/workflows/ios-release.yml"),
      "utf-8"
    );
    for (const expected of [
      "workflow_dispatch:",
      "group: ios-release-com.pcobooster.ios",
      "cancel-in-progress: false",
      "environment: ios-release-upload",
      "inputs.request_upload",
      "github.ref == 'refs/heads/main'",
      "BLOCKED: no uploader or signing credential retrieval is enabled.",
    ]) {
      expect(workflow).toContain(expected);
    }
    expect(workflow).not.toMatch(/^ {2}(?:push|pull_request|workflow_run):/mu);
    expect(workflow).not.toMatch(
      /id-token:|actions\/infisical|secrets-action|xcodebuild|ios:release\s/gu
    );
    const script = readFileSync(
      path.join(mobile, "scripts/release-ios.sh"),
      "utf-8"
    );
    expect(script).not.toContain("destination=upload");
    expect(script).toContain("destination=prepare");
  });

  it.each(["true", "1", "yes"])(
    "refuses the Apple account in Xcode when CI=%s",
    (ci) => {
      const { release } = releaseCheckout();
      const result = release({ CI: ci, BUILD_NUMBER: "400" });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "must sign with an App Store Connect API key"
      );
    }
  );

  it("refuses to release the fixture smoke build", () => {
    const { release } = releaseCheckout();
    const result = release({ EXPO_PUBLIC_PCOB_RELEASE_SMOKE: "1" });
    expect(result.status).toBe(64);
    expect(result.stderr).toContain("fixture smoke app");
  });

  it("needs an explicit build number without a key, instead of counting Git ancestry", () => {
    const { release, state } = releaseCheckout();
    const result = release({});
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("set BUILD_NUMBER");
    // The failed release let go of the lock on exit.
    expect(existsSync(path.join(state, "lock"))).toBeFalsy();
  });

  it("refuses a second release while one holds the lock", () => {
    const { release, state } = releaseCheckout();
    mkdirSync(path.join(state, "lock"), { recursive: true });
    writeFileSync(
      path.join(state, "lock/owner.json"),
      JSON.stringify({ pid: process.pid, revision: "abc", startedAt: "now" })
    );
    const result = release({ BUILD_NUMBER: "400" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Another release holds");
  });
});
