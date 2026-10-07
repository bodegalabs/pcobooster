import { View } from "react-native";

import { failureMessage } from "../../app-shell/queries";
import { PillButton } from "../../components/pill-button";
import { Skeleton } from "../../components/skeleton";
import { AppText } from "../../design/app-text";
import { colors } from "../../design/colors";

export const ReadStatus = ({
  error,
  retry,
}: {
  error: Error | null;
  retry?: () => void;
}) =>
  error === null ? (
    <View style={{ gap: 12 }}>
      {[140, 180, 110].map((width) => (
        <Skeleton key={width} width={width} height={18} />
      ))}
    </View>
  ) : (
    <View style={{ gap: 8 }}>
      <AppText font="rowDetail" color={colors.inkSecondary}>
        {failureMessage(error)}
      </AppText>
      {retry === undefined ? null : (
        <PillButton title="Retry" kind="outline" size="small" onPress={retry} />
      )}
    </View>
  );
