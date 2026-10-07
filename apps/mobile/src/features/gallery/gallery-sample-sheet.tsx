import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";

import { BottomActionBar } from "../../components/bottom-action-bar";
import { Glyph } from "../../components/glyph";
import { PersonAvatar } from "../../components/person-avatar";
import { SurfaceCard } from "../../components/surface-card";
import { AppText } from "../../design/app-text";
import { colors } from "../../design/colors";
import { Spacing } from "../../design/metrics";

const styles = StyleSheet.create({
  content: { gap: Spacing.lg, padding: Spacing.lg },
  fact: { alignItems: "center", flexDirection: "row", gap: Spacing.sm },
  facts: { gap: Spacing.sm },
  person: { alignItems: "center", flexDirection: "row", gap: Spacing.md },
  personText: { gap: 2 },
  root: { backgroundColor: colors.surfaceCanvas, flex: 1 },
  title: { alignItems: "center", paddingVertical: Spacing.lg },
});

/**
 * The gallery's sample sheet: medium and large detents, a solid content surface, and the iPhone
 * bottom actions as full-width buttons, the destructive one included.
 */
export const GallerySampleSheet = () => {
  const router = useRouter();
  const close = () => {
    router.back();
  };
  return (
    <View style={styles.root}>
      <View style={styles.title}>
        <AppText accessibilityRole="header" font="headline">
          Pending
        </AppText>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.person}>
          <PersonAvatar name="Taylor Lane" size="large" status="pending" />
          <View style={styles.personText}>
            <AppText font="cardTitle">Taylor Lane</AppText>
            <AppText color={colors.inkSecondary} font="rowDetail">
              Acoustic Guitar, Sunday 9:00 AM
            </AppText>
          </View>
        </View>
        <SurfaceCard contentStyle={styles.facts}>
          <View style={styles.fact}>
            <Glyph color={colors.ink} size={17} symbol="reasonHistory" />
            <AppText font="rowDetail">
              Served 3 times in the last 8 weeks
            </AppText>
          </View>
          <View style={styles.fact}>
            <Glyph color={colors.ink} size={17} symbol="reasonService" />
            <AppText font="rowDetail">No blockouts on this date</AppText>
          </View>
        </SurfaceCard>
      </ScrollView>
      <BottomActionBar
        actions={[
          { title: "Mark confirmed", onPress: close },
          { title: "Remove from plan", role: "destructive", onPress: close },
        ]}
      />
    </View>
  );
};
