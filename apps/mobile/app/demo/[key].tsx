import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";

import { activeCredentials } from "../../src/auth/protocol";
import { Action, Card, Label, Screen } from "../../src/components/ui";
import { runAction } from "../../src/errors";
import { useSession } from "../../src/runtime";

const DemoLinkScreen = () => {
  const { key } = useLocalSearchParams<{ key: string }>();
  const context = useSession();
  const [busy, setBusy] = useState(false);
  const credentials = activeCredentials(context.session);
  const open = async (): Promise<void> => {
    setBusy(true);
    await runAction(async () => {
      const result = await context.rpc.call("demo.start", { key });
      if (result.sessionToken === undefined) {
        throw new Error("That demo link isn't valid anymore.");
      }
      await context.update({
        ...context.session,
        demoToken: result.sessionToken,
      });
      router.replace("/");
    });
    setBusy(false);
  };
  return (
    <Screen title="Open demo" account={false}>
      <Card>
        <Label>
          {credentials.token === null
            ? "Explore pcobooster.com with a read-only demo."
            : "Open a read-only demo? Your Planning Center login will stay remembered on this device."}
        </Label>
        <Action
          label="Open read-only demo"
          disabled={busy}
          onPress={() => {
            void runAction(open);
          }}
        />
        <Action
          label="Keep current account"
          disabled={busy}
          onPress={() => {
            router.replace("/");
          }}
        />
      </Card>
    </Screen>
  );
};
export default DemoLinkScreen;
