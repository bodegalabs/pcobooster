// The Expo runtime globals the contracts reach while they load, installed from Expo's own
// modules the way `expo/src/winter` does once InitializeCore has run in the app.
import { installGlobal } from "expo/src/winter/installGlobal";
import { TextDecoder } from "expo/src/winter/TextDecoder";

installGlobal("TextDecoder", () => TextDecoder);
