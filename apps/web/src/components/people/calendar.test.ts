import { describe, expect, it } from "vitest";

import {
  commitmentCellTone,
  commitmentDot,
  engagementLabel,
  formatWeekdayMonthDay,
  heatLevelTone,
} from "@/components/people/calendar";

describe(heatLevelTone, () => {
  it("scales with the number of services", () => {
    expect(heatLevelTone(0)).toBe("empty");
    expect(heatLevelTone(1)).toBe("light");
    expect(heatLevelTone(3)).toBe("busy");
    expect(heatLevelTone(8)).toBe("peak");
  });

  it("treats rehearsal-only days as lightly busy", () => {
    expect(heatLevelTone(0, 2)).toBe("light");
  });
});

describe(commitmentCellTone, () => {
  it("separates confirmed and pending services", () => {
    expect(commitmentCellTone("service", "C")).toBe("confirmed");
    expect(commitmentCellTone("service", "U")).toBe("scheduled");
  });

  it("marks rehearsals", () => {
    expect(commitmentCellTone("rehearsal")).toBe("rehearsal");
  });
});

describe(engagementLabel, () => {
  it("calls unconfirmed services pending, as Services does", () => {
    expect(engagementLabel("service", "U")).toBe("Pending service");
    expect(engagementLabel("service", "Confirmed")).toBe("Confirmed service");
    expect(engagementLabel("rehearsal", "U")).toBe("Rehearsal");
    expect(commitmentDot("service")).toBe("pending");
  });
});

describe(formatWeekdayMonthDay, () => {
  it("labels a day of the month by its own calendar date, whatever the host zone", () => {
    expect(formatWeekdayMonthDay({ year: 2026, monthIndex: 9 }, 4)).toBe(
      "Sun, Oct 4"
    );
  });
});
