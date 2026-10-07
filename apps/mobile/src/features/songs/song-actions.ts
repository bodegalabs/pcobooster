import { ActionSheetIOS, Linking } from "react-native";

import { planningCenterSongUrl } from "./detail";

/**
 * A song row's long-press actions (Swift `contextMenu`): open it, its chord chart (with the
 * `chordCharts` flag), and its page in Planning Center, where hiding a song happens.
 */
export const showSongActions = ({
  title,
  songId,
  chartsEnabled,
  tidying,
  onOpen,
  onChart,
}: {
  title: string;
  songId: string;
  chartsEnabled: boolean;
  /** A tidy-up filter is on, so the Planning Center action is about hiding the song. */
  tidying: boolean;
  onOpen: () => void;
  onChart: () => void;
}): void => {
  const actions: { label: string; run: () => void }[] = [
    { label: "Open", run: onOpen },
  ];
  if (chartsEnabled) {
    actions.push({ label: "Chord Chart", run: onChart });
  }
  actions.push({
    label: tidying ? "Hide in Planning Center" : "Open in Planning Center",
    run: () => {
      void Linking.openURL(planningCenterSongUrl(songId));
    },
  });
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title,
      options: [...actions.map((action) => action.label), "Cancel"],
      cancelButtonIndex: actions.length,
    },
    (index) => {
      actions[index]?.run();
    }
  );
};
