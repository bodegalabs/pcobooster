import { useRouter } from "expo-router";
import type { NativeStackHeaderItem } from "expo-router";
import { Pressable, StyleSheet } from "react-native";

import { PersonAvatar } from "../components/person-avatar";
import { Metrics } from "../design/metrics";
import { accountDisplayName } from "./device-accounts";
import { useSession } from "./session";

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    height: Metrics.minimumTapTarget,
    justifyContent: "center",
    width: Metrics.minimumTapTarget,
  },
});

/** The signed-in person's avatar; opens the account sheet. */
const AccountButton = () => {
  const router = useRouter();
  const { active } = useSession();
  return (
    <Pressable
      accessibilityHint="Switch accounts, change appearance, or sign out"
      accessibilityLabel="Account"
      accessibilityRole="button"
      hitSlop={0}
      onPress={() => {
        router.push("/account");
      }}
      style={styles.button}
      testID="account-button"
    >
      <PersonAvatar name={active === null ? "" : accountDisplayName(active)} />
    </Pressable>
  );
};

/**
 * The account button on every tab root's navigation bar (Swift `AccountToolbarItem`): the
 * avatar without a glass capsule, App Store style.
 */
export const accountHeaderItem = (): NativeStackHeaderItem => ({
  type: "custom",
  element: <AccountButton />,
  hidesSharedBackground: true,
});
