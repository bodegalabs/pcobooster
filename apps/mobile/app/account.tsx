import { deriveFeatureAccess } from "@pcobooster/planning-center-models/access";
import { router, usePathname } from "expo-router";
import { useState } from "react";
import { Linking } from "react-native";

import {
  Action,
  Card,
  Choice,
  Field,
  Label,
  ReadState,
  Row,
  Screen,
  Toggle,
} from "../src/components/ui";
import { runAction } from "../src/errors";
import { useNativePreferences } from "../src/preferences";
import { useAccount, useRpcMutation, useSession } from "../src/runtime";

const AccountScreen = () => {
  const account = useAccount();
  const context = useSession();
  const [feedback, setFeedback] = useState("");
  const preferences = useNativePreferences();
  const submit = useRpcMutation("feedback.submit");
  const path = usePathname();
  return (
    <Screen title="Account" account={false}>
      <ReadState query={account.accounts}>
        <Card title={account.accounts.data?.session.name}>
          <Label secondary>{account.accounts.data?.session.email}</Label>
          {account.accounts.data?.accounts.map((linked) => (
            <Action
              key={linked.id}
              label={
                linked.identity?.organizationName ?? "Planning Center account"
              }
              selected={linked.id === account.accounts.data?.selectedAccountId}
              disabled={account.readOnly}
              onPress={() => {
                void runAction(async () => {
                  const selected = await context.rpc.call("accounts.select", {
                    accountId: linked.id,
                  });
                  await context.update({
                    ...context.session,
                    accounts: context.session.accounts.map((stored) =>
                      stored.user.id === context.session.activeUserId
                        ? {
                            ...stored,
                            selectedAccountId: selected.selectedAccountId,
                          }
                        : stored
                    ),
                  });
                  router.replace("/");
                });
              }}
            />
          ))}
          <Action
            label="Add a Planning Center login"
            disabled={account.readOnly}
            onPress={() => {
              void runAction(context.signIn);
            }}
          />
        </Card>
      </ReadState>
      <Card title="Remembered on this device">
        {context.session.accounts.map((stored) => (
          <Row
            key={stored.user.id}
            title={stored.user.name}
            detail={stored.user.email}
          >
            <Action
              label={`Switch to ${stored.user.name}`}
              onPress={() => {
                void runAction(async () => {
                  await context.update({
                    ...context.session,
                    activeUserId: stored.user.id,
                    demoToken: null,
                  });
                  router.replace("/");
                });
              }}
            />
            <Action
              label={`Remove ${stored.user.name} from device`}
              destructive
              onPress={() => {
                void runAction(async () => {
                  await context.removeAccount(stored.user.id);
                });
              }}
            />
          </Row>
        ))}
      </Card>
      <Card title="Your Planning Center access">
        {account.access.data ? (
          deriveFeatureAccess(account.access.data).map((feature) => (
            <Row
              key={feature.feature}
              title={feature.label}
              detail={[
                feature.availability,
                feature.detail,
                feature.ask === null ? "" : `Ask for ${feature.ask}`,
              ]
                .filter(Boolean)
                .join(". ")}
            />
          ))
        ) : (
          <ReadState query={account.access}>{null}</ReadState>
        )}
      </Card>
      <Card title="Appearance">
        <Choice
          values={["System", "Light", "Dark"]}
          value={preferences.appearance}
          onChange={(value) => {
            const appearance =
              value === "Light" || value === "Dark" ? value : "System";
            void runAction(async () => {
              await preferences.update({ ...preferences, appearance });
            });
          }}
        />
      </Card>
      <Card title="Privacy">
        <Toggle
          label="Share usage analytics"
          checked={preferences.analytics}
          onChange={(checked) => {
            void runAction(async () => {
              await preferences.update({ ...preferences, analytics: checked });
            });
          }}
        />
        <Label secondary>
          No session recordings. Analytics is off by default.
        </Label>
      </Card>
      {account.readOnly ? (
        <Card>
          <Label>Demo mode is read-only.</Label>
          <Action
            label="Leave demo"
            onPress={() => {
              void runAction(async () => {
                await context.rpc.call("demo.exit", {});
                await context.update({ ...context.session, demoToken: null });
                router.replace("/");
              });
            }}
          />
        </Card>
      ) : (
        <Card title="Feedback">
          <Label secondary>Feedback from {path}</Label>
          <Field
            label="What's on your mind?"
            value={feedback}
            onChangeText={setFeedback}
            multiline
            maxLength={5000}
          />
          <Action
            label="Send feedback"
            disabled={feedback.trim().length === 0 || submit.isPending}
            onPress={() => {
              submit.mutate(
                { message: feedback.trim(), path, sessionId: null },
                {
                  onSuccess: () => {
                    setFeedback("");
                  },
                }
              );
            }}
          />
        </Card>
      )}
      <Action
        label="Open Planning Center"
        onPress={() => {
          void Linking.openURL("https://services.planningcenteronline.com");
        }}
      />
      <Action
        label="Sign out"
        destructive
        onPress={() => {
          void runAction(async () => {
            await context.signOut();
            router.replace("/");
          });
        }}
      />
    </Screen>
  );
};
export default AccountScreen;
