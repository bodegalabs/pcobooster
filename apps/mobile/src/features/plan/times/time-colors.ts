import type { PlanTime } from "@pcobooster/planning-center-models/types";

import { colors } from "../../../design/colors";

export const timeTint = (time: PlanTime) => {
  if (time.timeType === "service") {
    return colors.chart2;
  }
  return time.timeType === "rehearsal" ? colors.chart1 : colors.inkTertiary;
};
