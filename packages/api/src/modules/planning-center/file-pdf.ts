import { ExternalServiceFailure } from "@pcobooster/api/application/errors/external-service-failure";
import {
  bytesToBase64,
  readPdfBytes,
} from "@pcobooster/api/modules/planning-center/chord-charts";
import { Effect } from "effect";

/** Only provider storage is fetched by the Worker; arbitrary linked files stay in the browser. */
export const isProviderFileUrl = (url: string): boolean => {
  const parsed = new URL(url);
  return (
    parsed.protocol === "https:" &&
    parsed.username === "" &&
    parsed.password === "" &&
    (parsed.port === "" || parsed.port === "443") &&
    ["amazonaws.com", "planningcenteronline.com", "planningcenter.com"].some(
      (domain) =>
        parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
    )
  );
};
const failure = (message: string) =>
  new ExternalServiceFailure({ message, service: "planning-center" });
const MAX_FILE_REDIRECTS = 3;
const downloadProviderPdf = (
  initialUrl: string,
  fetch: typeof globalThis.fetch
) =>
  Effect.gen(function* download() {
    let url = initialUrl;
    for (let redirects = 0; redirects <= MAX_FILE_REDIRECTS; redirects += 1) {
      const currentUrl = url;
      if (!isProviderFileUrl(currentUrl)) {
        return yield* failure(
          "This linked PDF must be opened in its own viewer."
        );
      }
      const response = yield* Effect.tryPromise({
        try: async (signal) =>
          await fetch(currentUrl, {
            signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
            redirect: "manual",
          }),
        catch: () => failure("The file could not be downloaded for preview."),
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        yield* Effect.promise(async () => {
          await response.body?.cancel();
        });
        if (location === null) {
          return yield* failure("The file redirect has no destination.");
        }
        const next = yield* Effect.try({
          try: () => new URL(location, currentUrl).href,
          catch: () => failure("The file redirect is invalid."),
        });
        url = next;
        continue;
      }
      if (!response.ok) {
        return yield* failure(
          "The file link expired or the file is unavailable. Try again."
        );
      }
      return response;
    }
    return yield* failure("The file redirected too many times to preview.");
  });
export const readFilePdf = (url: string, fetch: typeof globalThis.fetch) =>
  Effect.gen(function* readFile() {
    const response = yield* downloadProviderPdf(url, fetch);
    const bytes = yield* readPdfBytes(response);
    if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
      return yield* failure(
        "This file is not a PDF. Open the original file instead."
      );
    }
    return bytesToBase64(bytes);
  });
