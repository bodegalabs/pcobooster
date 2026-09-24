const unreleasedVersion = "development";

/** The commit a deployment was built from; deploy verification compares it to the expected SHA. */
export const resolveReleaseVersion = (configuredValue?: string): string =>
  configuredValue === undefined || configuredValue === ""
    ? unreleasedVersion
    : configuredValue;

export const releaseVersion = (): string =>
  resolveReleaseVersion(process.env.PCOBOOSTER_VERSION);
