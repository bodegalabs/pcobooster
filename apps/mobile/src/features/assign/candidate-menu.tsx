import {
  Button,
  ContextMenu,
  Divider,
  Host,
  RNHostView,
  Toggle,
} from "@expo/ui/swift-ui";
import { disabled } from "@expo/ui/swift-ui/modifiers";
import { useState } from "react";
import type { ReactElement } from "react";
import { View } from "react-native";

import {
  scheduleStatusLabel,
  scheduleStatusSymbol,
  scheduleStatuses,
} from "../../design/status";
import type { ScheduleStatus } from "../../design/status";
import { AppSymbol } from "../../design/symbols";
import type { AppSymbolName } from "../../design/symbols";
import type { CandidatePresentation } from "./presentation";

const destructiveRole = "destructive";
const systemImage = (symbol: AppSymbolName) => {
  const source = AppSymbol[symbol];
  return "sf" in source ? source.sf : undefined;
};

/**
 * A candidate row's long-press menu and preview (Swift `contextMenuItems`): their status
 * choices and Unschedule once they're on the slot, otherwise Add to the position; then Show
 * Details, View Person, and Open in Planning Center.
 */
export const CandidateMenu = ({
  children,
  preview,
  presentation,
  positionName,
  canSchedule,
  showsPersonLink,
  onAdd,
  onStatus,
  onRemove,
  onDetails,
  onViewPerson,
  onOpenPlanningCenter,
}: {
  children: ReactElement;
  preview: ReactElement;
  presentation: CandidatePresentation;
  positionName: string;
  canSchedule: boolean;
  showsPersonLink: boolean;
  onAdd: () => void;
  onStatus: (status: ScheduleStatus) => void;
  onRemove: () => void;
  onDetails: () => void;
  onViewPerson: () => void;
  onOpenPlanningCenter: () => void;
}) => {
  const current = presentation.status ?? "pending";
  // The hosted row sizes to its content, so it gets the list's width explicitly.
  const [width, setWidth] = useState<number | undefined>();
  return (
    <View
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
      }}
    >
      {width === undefined ? null : (
        <Host matchContents>
          <ContextMenu>
            <ContextMenu.Trigger>
              <RNHostView matchContents>
                <View style={{ width }}>{children}</View>
              </RNHostView>
            </ContextMenu.Trigger>
            <ContextMenu.Items>
              {presentation.scheduled ? (
                <>
                  {scheduleStatuses.map((status) => (
                    <Toggle
                      key={status}
                      label={scheduleStatusLabel[status]}
                      systemImage={systemImage(scheduleStatusSymbol[status])}
                      isOn={status === current}
                      modifiers={[disabled(!canSchedule)]}
                      onIsOnChange={() => {
                        if (status !== current) {
                          onStatus(status);
                        }
                      }}
                    />
                  ))}
                  <Divider />
                  <Button
                    label="Unschedule"
                    systemImage="trash"
                    role={destructiveRole}
                    modifiers={[disabled(!canSchedule)]}
                    onPress={onRemove}
                  />
                </>
              ) : (
                <Button
                  label={`Add to ${positionName}`}
                  systemImage="calendar.badge.plus"
                  modifiers={[
                    disabled(
                      !canSchedule || presentation.disabledReason !== undefined
                    ),
                  ]}
                  onPress={onAdd}
                />
              )}
              <Divider />
              <Button
                label="Show Details"
                systemImage="info.circle"
                onPress={onDetails}
              />
              {showsPersonLink ? (
                <Button
                  label="View Person"
                  systemImage="person.2"
                  onPress={onViewPerson}
                />
              ) : null}
              <Button
                label="Open in Planning Center"
                systemImage="arrow.up.right.square"
                onPress={onOpenPlanningCenter}
              />
            </ContextMenu.Items>
            <ContextMenu.Preview>
              <RNHostView matchContents>{preview}</RNHostView>
            </ContextMenu.Preview>
          </ContextMenu>
        </Host>
      )}
    </View>
  );
};
