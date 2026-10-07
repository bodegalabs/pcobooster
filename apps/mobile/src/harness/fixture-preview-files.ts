import { throwIfAborted } from "@pcobooster/client/abort-signal";

/** Bundled files for development and Release smoke fixtures, so previews draw without a network. */
import type { PreviewStore } from "../features/songs/preview-store";
import { fixtureMedia } from "./fixture-media";
import pdfFixture from "./fixtures/chordCharts.pdf.json";

const FIXTURE_HOST = "fixtures.invalid";

/** A 16 by 12 gradient PNG, the stage plot fixture. */
const STAGE_PLOT_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAIAAADkharWAAABQUlEQVR42g3LkaLGMAyA0ftgP4/LH4/H43F5HKlEKpFKpBKpRPo6d8fP3w85kIKAnMiF3MiDVORFBFHEEEcCSeTvRztohQbtpF20m/bQKu2lCU1pRnNa0JL2BT3QgoKe6IXe6INW9EUFVdRQRwNN9Av9oBc69JN+0W/6Q6/0ly50pRvd6UFP+hfswAoGdmIXdmMPVrEXE0wxwxwLLLEvjINRGDBOxsW4GQ+jMl6GMJRhDGcEIxlf8AMvOPiJX/iNP3jFX1xwxQ13PPDEvzAPZmHCPJkX82Y+zMp8mcJUpjGdGcxkfiEOohAQJ3ERN/EQlXgJIZQwwokgkvjCOliFBetkXayb9bAq62UJS1nGclawkvWFPMhCQp7kRd7kQ1byJYVU0kgng0zyC/tgFzbsk32xb/bDruyXLWxlG9vZwU72P8+ENXCfrfZpAAAAAElFTkSuQmCC";

/** Each fixture attachment with a stored file, by id (`songs.attachmentLink.json`). */
const fixtureFileBytes = new Map([
  ["88004", STAGE_PLOT_PNG],
  ["88005", pdfFixture.default.data],
]);

/** The attachment id of a fixture link, or null for any real link. */
const fixtureId = (url: URL): string | null =>
  url.hostname === FIXTURE_HOST ? (url.pathname.split("/").at(-1) ?? "") : null;

/**
 * Serves the fixtures' signed links from bundled bytes and refuses every other fixture link, as
 * an expired or missing file would; any real link goes to `device`. Fixture audio and video are
 * written to the device and played from there, so the player works offline.
 */
export const fixturePreviewStore = (device: PreviewStore): PreviewStore => ({
  ...device,
  download: async (scope, folder, name, url, signal) => {
    const id = fixtureId(url);
    if (id === null) {
      return await device.download(scope, folder, name, url, signal);
    }
    throwIfAborted(signal);
    const bytes = fixtureFileBytes.get(id);
    if (bytes === undefined) {
      throw new Error("The fixture has no stored file at this link.");
    }
    return device.writeBase64(scope, folder, name, bytes);
  },
  playable: async (scope, folder, name, url, signal) => {
    const id = fixtureId(url);
    if (id === null) {
      return await device.playable(scope, folder, name, url, signal);
    }
    throwIfAborted(signal);
    const media = fixtureMedia.get(id);
    if (media === undefined) {
      throw new Error("The fixture has no media at this link.");
    }
    return device.writeBase64(scope, folder, media.name, media.base64());
  },
});
