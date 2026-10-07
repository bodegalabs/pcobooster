import {
  Button,
  HStack,
  Host,
  Image,
  Menu,
  Section,
  Text,
  Toggle,
  VStack,
} from "@expo/ui/swift-ui";
import {
  accessibilityIdentifier,
  accessibilityLabel,
  background,
  buttonStyle,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  menuIndicator,
  menuStyle,
} from "@expo/ui/swift-ui/modifiers";
// SwiftUI's own name (`shapes`), read as a member.
import * as SwiftUIModifiers from "@expo/ui/swift-ui/modifiers";
import type { TeamPositionGroup } from "@pcobooster/planning-center-models/types";
import type { NativeStackNavigationOptions } from "expo-router";
import { Stack, useNavigation } from "expo-router";
import { useEffect, useRef } from "react";
import type { SearchBarCommands } from "react-native-screens";

import {
  colors,
  resolvedTokenColor,
  useColorVariant,
} from "../../design/colors";
import { openLabel, slotKey } from "./presentation";
import type { ResolvedSlot } from "./presentation";

const TITLE_WIDTH = 200;
const TITLE_HEIGHT = 40;

interface TitleMenuProps {
  title: string;
  subtitle: string;
  groups: readonly TeamPositionGroup[];
  /** The open position's `slotKey`, checked in the menu. */
  selection: string;
  canAddPosition: boolean;
  onSelect: (slot: ResolvedSlot) => void;
  onAddPosition: () => void;
}
interface ToolbarProps extends TitleMenuProps {
  history: boolean;
  onHistory: () => void;
  onNext?: () => void;
  onSearch: (text: string) => void;
}

/**
 * The navigation title as Swift's `toolbarTitleMenu`: a section per team, each position with a
 * checkmark on the open one and how many slots it still needs, then Add Position.
 */
const TitleMenu = ({
  title,
  subtitle,
  groups,
  selection,
  canAddPosition,
  onSelect,
  onAddPosition,
}: TitleMenuProps) => {
  const variant = useColorVariant();
  const ink = resolvedTokenColor("ink", variant);
  const secondary = resolvedTokenColor("inkSecondary", variant);
  // A fixed frame: the header lays out its title before SwiftUI can report a size.
  return (
    <Host style={{ width: TITLE_WIDTH, height: TITLE_HEIGHT }}>
      <Menu
        modifiers={[
          menuStyle("button"),
          buttonStyle("plain"),
          menuIndicator("hidden"),
          accessibilityLabel("Choose position"),
          accessibilityIdentifier("assign-position-menu"),
        ]}
        label={
          <VStack
            spacing={1}
            modifiers={[frame({ width: TITLE_WIDTH, height: TITLE_HEIGHT })]}
          >
            <HStack spacing={8}>
              <Text
                modifiers={[
                  font({ textStyle: "subheadline", weight: "semibold" }),
                  foregroundStyle(ink),
                  lineLimit(1),
                ]}
              >
                {title}
              </Text>
              <Image
                systemName="chevron.down"
                modifiers={[
                  font({ size: 9, weight: "bold" }),
                  foregroundStyle(secondary),
                  frame({ width: 17, height: 17 }),
                  background(
                    resolvedTokenColor("surfaceMuted", variant),
                    SwiftUIModifiers.shapes.circle()
                  ),
                ]}
              />
            </HStack>
            <Text
              modifiers={[
                font({ textStyle: "caption" }),
                foregroundStyle(secondary),
                lineLimit(1),
              ]}
            >
              {subtitle}
            </Text>
          </VStack>
        }
      >
        {groups.map((group) => (
          <Section key={group.teamId} title={group.teamName}>
            {group.positions.map((position) => {
              const slot = { group, position };
              const key = slotKey(slot);
              return (
                <Toggle
                  key={key}
                  isOn={key === selection}
                  onIsOnChange={() => {
                    onSelect(slot);
                  }}
                >
                  <Text>{position.name}</Text>
                  <Text>{openLabel(position)}</Text>
                </Toggle>
              );
            })}
          </Section>
        ))}
        {canAddPosition ? (
          <Section>
            <Button
              label="Add Position…"
              systemImage="plus"
              onPress={onAddPosition}
            />
          </Section>
        ) : null}
      </Menu>
    </Host>
  );
};

const toolbarOptions = (props: ToolbarProps): NativeStackNavigationOptions => ({
  title: props.title,
  headerTitleAlign: "center",
  headerStyle: { backgroundColor: colors.surfaceCanvas },
  headerTitle: () => <TitleMenu {...props} />,
  unstable_headerRightItems: () => [
    {
      type: "button",
      label: "Show History",
      icon: { type: "sfSymbol", name: "chart.bar.xaxis" },
      onPress: props.onHistory,
      selected: props.history,
      sharesBackground: false,
      width: 40,
    },
    {
      type: "button",
      label: "Next Open Position",
      icon: { type: "sfSymbol", name: "forward.end" },
      onPress: () => {
        props.onNext?.();
      },
      disabled: props.onNext === undefined,
      sharesBackground: false,
      width: 40,
    },
  ],
});

/** Title menu, the always-present filter (cleared when the position changes), and actions. */
export const AssignToolbar = (props: ToolbarProps) => {
  const navigation = useNavigation();
  const search = useRef<SearchBarCommands>(null);
  const shown = useRef(props.selection);
  const { selection, onSearch } = props;
  useEffect(() => {
    navigation.setOptions({
      headerSearchBarOptions: {
        ref: search,
        placeholder: "Filter people",
        hideWhenScrolling: true,
        hideNavigationBar: false,
        onChangeText: (event: { nativeEvent: { text: string } }) => {
          onSearch(event.nativeEvent.text);
        },
      },
    });
  }, [navigation, onSearch]);
  useEffect(() => {
    if (shown.current !== selection) {
      shown.current = selection;
      search.current?.clearText();
    }
  }, [selection]);
  return <Stack.Screen options={toolbarOptions(props)} />;
};
