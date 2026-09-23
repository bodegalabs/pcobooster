import { isNonEmptyString } from "@pcobooster/planning-center-models/json";

export const readCookie = (request: Request, name: string): string | null => {
  const header = request.headers.get("cookie");
  if (!isNonEmptyString(header)) {
    return null;
  }

  const segments = header.split(";").map((segment) => segment.trim());
  for (const segment of segments) {
    const [key, ...valueParts] = segment.split("=");
    if (key !== name) {
      continue;
    }
    const value = valueParts.join("=");
    if (!value) {
      return null;
    }
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return null;
};
