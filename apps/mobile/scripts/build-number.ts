const positiveInteger = /^[1-9]\d*$/u;

/** Expo keeps build numbers as strings; reject values Apple cannot treat as integers. */
export const iosBuildNumber = (buildNumber = "1"): string => {
  if (!positiveInteger.test(buildNumber)) {
    throw new Error(
      "BUILD_NUMBER must be a positive integer without leading zeros."
    );
  }
  return buildNumber;
};
