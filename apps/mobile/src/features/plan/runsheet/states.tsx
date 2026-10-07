import { View } from "react-native";

import { Glyph } from "../../../components/glyph";
import { PillButton } from "../../../components/pill-button";
import { Skeleton } from "../../../components/skeleton";
import { SurfaceCard } from "../../../components/surface-card";
import { AppText } from "../../../design/app-text";
import { colors } from "../../../design/colors";
import { Radius, Spacing } from "../../../design/metrics";

const SKELETON_ROWS = [
  { id: 0, header: true, width: 110 },
  { id: 1, header: false, width: 170 },
  { id: 2, header: false, width: 130 },
  { id: 3, header: false, width: 150 },
  { id: 4, header: true, width: 90 },
  { id: 5, header: false, width: 140 },
  { id: 6, header: false, width: 100 },
  { id: 7, header: false, width: 160 },
] as const;
const DETAIL_WIDTH = 0.6;
const ARTWORK_SIZE = 48;

/** Placeholder rows for the first load, shaped like a run sheet (headers and items). */
export const RunSheetSkeleton = () => (
  <View
    accessible
    accessibilityLabel="Loading the run sheet"
    style={{ paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm }}
  >
    {SKELETON_ROWS.map((row) =>
      row.header ? (
        <View
          key={row.id}
          style={{ paddingTop: Spacing.xxl, paddingBottom: Spacing.md }}
        >
          <Skeleton width={row.width} height={10} />
        </View>
      ) : (
        <View
          key={row.id}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: Spacing.md,
            minHeight: 56,
          }}
        >
          <Skeleton width={34} />
          <View style={{ gap: Spacing.sm }}>
            <Skeleton width={row.width} height={13} />
            <Skeleton width={row.width * DETAIL_WIDTH} height={9} />
          </View>
        </View>
      )
    )}
  </View>
);

/** "This plan has no structure yet", with the three ways to start. */
export const RunSheetEmptyCard = ({
  canEdit,
  onAdd,
}: {
  canEdit: boolean;
  onAdd: (kind: "song" | "header" | "item") => void;
}) => (
  <SurfaceCard contentStyle={{ alignItems: "center", gap: Spacing.md }}>
    <View
      style={{
        width: ARTWORK_SIZE,
        height: ARTWORK_SIZE,
        borderRadius: Radius.tile,
        borderCurve: "continuous",
        backgroundColor: colors.surfaceMuted,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Glyph symbol="songs" size={22} color={colors.inkSecondary} />
    </View>
    <View style={{ alignItems: "center", gap: Spacing.xxs }}>
      <AppText font="cardTitle">This plan has no structure yet</AppText>
      <AppText
        font="rowDetail"
        color={colors.inkSecondary}
        style={{ textAlign: "center" }}
      >
        {canEdit
          ? "Pick a song from the library, or start with a header or item."
          : "Nothing is on this plan's run sheet in Planning Center."}
      </AppText>
    </View>
    {canEdit ? (
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: Spacing.sm,
          paddingTop: Spacing.xs,
        }}
      >
        <PillButton
          title="Add Song"
          symbol="song"
          testID="run-sheet-empty-song"
          onPress={() => {
            onAdd("song");
          }}
        />
        <PillButton
          title="Add Header"
          kind="outline"
          onPress={() => {
            onAdd("header");
          }}
        />
        <PillButton
          title="Add Item"
          kind="outline"
          onPress={() => {
            onAdd("item");
          }}
        />
      </View>
    ) : null}
  </SurfaceCard>
);
