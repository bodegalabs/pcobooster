import { router, usePathname } from "expo-router";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import type { TextInputProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { errorMessage } from "../errors";

const styles = StyleSheet.create({
  screen: {
    padding: 20,
    gap: 18,
    maxWidth: 900,
    width: "100%",
    alignSelf: "center",
    paddingBottom: 40,
  },
  title: { fontSize: 32, fontWeight: "700", flexShrink: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stack: { gap: 8, paddingVertical: 6 },
  card: {
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  action: {
    minHeight: 44,
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  input: {
    minHeight: 46,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 16,
  },
});

export const useColors = () =>
  useColorScheme() === "dark"
    ? {
        canvas: "#101114",
        surface: "#1b1d22",
        text: "#f4f4f5",
        secondary: "#aaaeb7",
        border: "#35383f",
        accent: "#8ba8f8",
        danger: "#ff8a8a",
      }
    : {
        canvas: "#f5f5f7",
        surface: "#ffffff",
        text: "#18191d",
        secondary: "#656a73",
        border: "#e1e3e8",
        accent: "#315bb7",
        danger: "#b12a32",
      };

export const Label = ({
  children,
  secondary = false,
  heading = false,
}: {
  children: ReactNode;
  secondary?: boolean;
  heading?: boolean;
}) => {
  const colors = useColors();
  return (
    <Text
      accessibilityRole={heading ? "header" : undefined}
      style={{
        color: secondary ? colors.secondary : colors.text,
        fontSize: heading ? 20 : 16,
        fontWeight: heading ? "600" : "400",
        lineHeight: heading ? 28 : 24,
      }}
    >
      {children}
    </Text>
  );
};

export const Action = ({
  label,
  onPress,
  disabled = false,
  destructive = false,
  selected = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
  selected?: boolean;
}) => {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        {
          opacity: disabled ? 0.4 : 1,
          backgroundColor: pressed || selected ? colors.border : colors.surface,
        },
      ]}
    >
      <Text
        style={{
          color: destructive ? colors.danger : colors.accent,
          fontSize: 16,
          fontWeight: "500",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
};

export const Field = ({
  label,
  ...props
}: TextInputProps & { label: string }) => {
  const colors = useColors();
  return (
    <View style={styles.stack}>
      <Label secondary>{label}</Label>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.secondary}
        style={[
          styles.input,
          {
            color: colors.text,
            backgroundColor: colors.canvas,
            borderColor: colors.border,
          },
        ]}
        {...props}
      />
    </View>
  );
};

export const Row = ({
  title,
  detail,
  onPress,
  children,
}: {
  title: string;
  detail?: string;
  onPress?: () => void;
  children?: ReactNode;
}) => (
  <View style={styles.stack}>
    {onPress ? (
      <Action label={title} onPress={onPress} />
    ) : (
      <Label>{title}</Label>
    )}
    {detail === undefined ? null : <Label secondary>{detail}</Label>}
    {children}
  </View>
);

export const Card = ({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) => {
  const colors = useColors();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      {title === undefined ? null : <Label heading>{title}</Label>}
      {children}
    </View>
  );
};

export const ReadState = ({
  query,
  children,
}: {
  query: {
    isPending: boolean;
    error: Error | null;
    refetch: () => void;
  };
  children: ReactNode;
}) => {
  if (query.isPending) {
    return <ActivityIndicator accessibilityLabel="Loading" />;
  }
  if (query.error !== null) {
    return (
      <Card>
        <Label>{errorMessage(query.error)}</Label>
        <Action
          label="Retry"
          onPress={() => {
            query.refetch();
          }}
        />
      </Card>
    );
  }
  return <View>{children}</View>;
};

export const Choice = <Value extends string>({
  values,
  value,
  onChange,
}: {
  values: readonly Value[];
  value: Value;
  onChange: (value: Value) => void;
}) => (
  <View style={styles.wrap}>
    {values.map((entry) => (
      <Action
        key={entry}
        label={entry}
        selected={value === entry}
        onPress={() => {
          onChange(entry);
        }}
      />
    ))}
  </View>
);

export const Toggle = ({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) => (
  <Action
    label={`${checked ? "✓ " : ""}${label}`}
    selected={checked}
    onPress={() => {
      onChange(!checked);
    }}
  />
);

const rootPaths = new Set(["/", "/services", "/people", "/songs", "/search"]);

export const Screen = ({
  title,
  children,
  refresh,
  fetching = false,
  account = true,
}: {
  title: string;
  children: ReactNode;
  refresh?: () => void;
  fetching?: boolean;
  account?: boolean;
}) => {
  const colors = useColors();
  const path = usePathname();
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      edges={
        rootPaths.has(path)
          ? ["top", "bottom", "left", "right"]
          : ["bottom", "left", "right"]
      }
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          refreshControl={
            refresh ? (
              <RefreshControl refreshing={fetching} onRefresh={refresh} />
            ) : undefined
          }
          contentContainerStyle={styles.screen}
        >
          <View style={styles.row}>
            <Text
              accessibilityRole="header"
              style={[styles.title, { color: colors.text }]}
            >
              {title}
            </Text>
            {account ? (
              <Action
                label="Account"
                onPress={() => {
                  router.push("/account");
                }}
              />
            ) : null}
          </View>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export const Editor = ({
  label,
  children,
  onClose,
  visible,
  busy = false,
}: {
  label: string;
  children: ReactNode;
  onClose: () => void;
  visible: boolean;
  busy?: boolean;
}) => {
  const colors = useColors();
  return (
    <Modal
      visible={visible}
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      allowSwipeDismissal
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.screen}
          >
            <View style={styles.row}>
              <Label heading>{label}</Label>
              <Action
                label={busy ? "Saving…" : "Close"}
                onPress={onClose}
                disabled={busy}
              />
            </View>
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

export const useDebounced = (value: string, delay = 300): string => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delay);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);
  return debounced;
};
