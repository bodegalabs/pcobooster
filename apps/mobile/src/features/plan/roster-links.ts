import { planningCenterPersonUrl } from "@pcobooster/planning-center-models/planning-center-person-url";
import { Linking } from "react-native";

import { useToasts } from "../../lib/toasts";

/** Opens a person's page in Planning Center People (Swift `RosterLinks.person`). */
export const useOpenPlanningCenterPerson = () => {
  const toasts = useToasts();
  return (personId: string) => {
    void (async () => {
      try {
        await Linking.openURL(planningCenterPersonUrl(personId));
      } catch {
        toasts.showError("Couldn't open Planning Center.");
      }
    })();
  };
};
