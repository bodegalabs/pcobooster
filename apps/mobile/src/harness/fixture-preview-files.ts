/** Development-only stored files for the attachment fixtures, so previews draw without a network. */
import type { PreviewFiles } from "../features/songs/previews";
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

/**
 * Serves the fixtures' signed links from bundled bytes and refuses every other fixture link, as
 * an expired or missing file would; any real link goes to `device`.
 */
export const fixturePreviewFiles = (device: PreviewFiles): PreviewFiles => ({
  writeBase64: device.writeBase64,
  download: async (scope, folder, name, url, signal) => {
    if (!URL.canParse(url) || new URL(url).hostname !== FIXTURE_HOST) {
      return await device.download(scope, folder, name, url, signal);
    }
    signal.throwIfAborted();
    const id = new URL(url).pathname.split("/").at(-1) ?? "";
    const bytes = fixtureFileBytes.get(id);
    if (bytes === undefined) {
      throw new Error("The fixture has no stored file at this link.");
    }
    return device.writeBase64(scope, folder, name, bytes);
  },
});
