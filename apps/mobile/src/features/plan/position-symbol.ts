import { resolvePositionIconId } from "@pcobooster/planning-center-models/position-icon";
import type { PositionIconId } from "@pcobooster/planning-center-models/position-icon";

import type { AppSymbolName } from "../../design/symbols";

const symbols: Record<PositionIconId, AppSymbolName> = {
  livestream: "positionLivestream",
  camera: "positionCamera",
  "music-note": "positionPresentation",
  sound: "positionSound",
  "camera-video": "positionVideo",
  guitar: "positionGuitar",
  drum: "positionDrum",
  piano: "positionPiano",
  "mic-vocal": "positionVocals",
  music: "positionMusic",
};
export const positionSymbol = (position: string, team: string): AppSymbolName =>
  symbols[resolvePositionIconId(position, team)];
