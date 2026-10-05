import { RpcError } from "@pcobooster/contracts/errors";
import { Schema } from "effect";
import { Alert } from "react-native";

export const errorMessage = (error: typeof Schema.Unknown.Type): string => {
  if (error instanceof RpcError) {
    const retry =
      "retryAfterSeconds" in error.data
        ? error.data.retryAfterSeconds
        : undefined;
    return `${error.data.message}${Schema.is(Schema.Number)(retry) ? ` Try again in ${retry} seconds.` : ""}`;
  }
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
};
export const reportError = (error: typeof Schema.Unknown.Type): void => {
  Alert.alert("pcobooster.com", errorMessage(error));
};
/** Event handlers report failures once without leaving an unhandled promise. */
export const runAction = async <Result>(
  operation: () => Promise<Result>
): Promise<void> => {
  try {
    await operation();
  } catch (error) {
    reportError(error);
  }
};
