import { Redirect, router } from "expo-router";
import { useState } from "react";
import { Alert } from "react-native";

import { demoKeyFromLink } from "../src/auth/protocol";
import { pendingNativeRoute } from "../src/auth/route-intent";
import { useServicesAccess } from "../src/auth/services-access";
import {
  Action,
  Card,
  Field,
  Label,
  ReadState,
  Screen,
} from "../src/components/ui";
import { errorMessage, runAction } from "../src/errors";
import { useSession } from "../src/runtime";

const Home = () => {
  const context = useSession();
  const [demo, setDemo] = useState("");
  const [busy, setBusy] = useState(false);
  const { signedIn, access, canEnterProduct } = useServicesAccess();
  if (context.launching) {
    return (
      <Screen title="pcobooster.com" account={false}>
        <Label>Restoring your session…</Label>
      </Screen>
    );
  }
  if (canEnterProduct) {
    return <Redirect href={pendingNativeRoute()} />;
  }
  if (signedIn) {
    return (
      <Screen title="pcobooster.com">
        <ReadState query={access}>
          <Card title="Planning Center Services access needed">
            <Label>
              This account cannot open Planning Center Services. Ask your
              Planning Center administrator for Services access, then check
              again.
            </Label>
            <Action
              label="Check again"
              onPress={() => {
                void access.refetch();
              }}
            />
            <Action
              label="Switch account"
              onPress={() => {
                router.push("/account");
              }}
            />
            <Action
              label="Sign in with another account"
              onPress={() => {
                void runAction(context.signIn);
              }}
            />
            <Action
              label="Sign out"
              onPress={() => {
                void runAction(context.signOut);
              }}
            />
          </Card>
        </ReadState>
      </Screen>
    );
  }
  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    try {
      await operation();
    } catch (error) {
      Alert.alert("Sign in", errorMessage(error));
    }
    setBusy(false);
  };
  return (
    <Screen title="pcobooster.com" account={false}>
      <Card>
        <Label heading>Planning Center, with room to think.</Label>
        {context.expired ? (
          <Label>Your session ended. Sign in again to continue.</Label>
        ) : null}
        <Action
          label={busy ? "Signing in…" : "Sign in with Planning Center"}
          disabled={busy}
          onPress={() => {
            void run(context.signIn);
          }}
        />
      </Card>
      <Card title="Have a demo link?">
        <Field
          label="Demo link or key"
          value={demo}
          onChangeText={setDemo}
          autoCapitalize="none"
        />
        <Action
          label="Open read-only demo"
          disabled={busy || !demo.trim()}
          onPress={() => {
            void run(async () => {
              const result = await context.rpc.call("demo.start", {
                key: demoKeyFromLink(demo),
              });
              if (result.sessionToken === undefined) {
                throw new Error("That demo link isn't valid anymore.");
              }
              await context.update({
                ...context.session,
                demoToken: result.sessionToken,
              });
            });
          }}
        />
      </Card>
    </Screen>
  );
};
export default Home;
