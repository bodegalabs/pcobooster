import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";

import { BottomActionBar } from "../../components/bottom-action-bar";
import type { GlassAction } from "../../components/glass-button";
import { Glyph } from "../../components/glyph";
import { SurfaceCard } from "../../components/surface-card";
import { AppText } from "../../design/app-text";
import { colors } from "../../design/colors";

export const EditorSection = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <View style={{ gap: 8 }}>
    <AppText font="sectionLabel" color={colors.inkSecondary}>
      {title}
    </AppText>
    <SurfaceCard contentStyle={{ gap: 12 }}>{children}</SurfaceCard>
  </View>
);

const NO_ACTIONS: readonly GlassAction[] = [];

export const EditorSheet = ({
  title,
  children,
  onClose,
  actions = NO_ACTIONS,
  holdsDismiss = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  actions?: readonly GlassAction[];
  /** Keeps the sheet from swiping away while closing must ask first (Swift `interactiveDismissDisabled`). */
  holdsDismiss?: boolean;
}) => (
  <Modal
    visible
    animationType="slide"
    presentationStyle="pageSheet"
    allowSwipeDismissal={!holdsDismiss}
    onRequestClose={onClose}
  >
    <View style={{ flex: 1, backgroundColor: colors.surfaceCanvas }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: 16,
          minHeight: 60,
        }}
      >
        <AppText font="cardTitle" style={{ flex: 1, textAlign: "center" }}>
          {title}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          testID="plan-editor-close"
          onPress={onClose}
          style={{
            padding: 12,
            borderRadius: 999,
            backgroundColor: colors.surfaceSecondary,
          }}
        >
          <Glyph symbol="close" size={17} color={colors.ink} />
        </Pressable>
      </View>
      <ScrollView
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 32 }}
      >
        {children}
      </ScrollView>
      {actions.length > 0 ? <BottomActionBar actions={actions} /> : null}
    </View>
  </Modal>
);
