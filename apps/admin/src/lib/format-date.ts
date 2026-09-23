/** Admin activity is reviewed in Pacific time, matching PostHog reporting. */
const ADMIN_TIME_ZONE = "America/Los_Angeles";

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: ADMIN_TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: ADMIN_TIME_ZONE,
  dateStyle: "medium",
});

export const formatDateTime = (value: string | null): string => {
  if (value === null || value === "") {
    return "Never";
  }
  return dateTimeFormatter.format(new Date(value));
};

export const formatDate = (value: string): string =>
  dateFormatter.format(new Date(value));
