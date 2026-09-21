import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const lefthookSetting = process.env.LEFTHOOK?.toLowerCase();
const hooksDisabled = lefthookSetting === "0" || lefthookSetting === "false";

if (!(hooksDisabled || !existsSync(".git"))) {
  const install = spawnSync("lefthook", ["install"], {
    stdio: "inherit",
  });

  if (install.error) {
    throw install.error;
  }

  if (install.status !== 0) {
    process.exitCode = install.status ?? 1;
  }
}
