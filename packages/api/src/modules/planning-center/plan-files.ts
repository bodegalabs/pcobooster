import { ExternalServiceFailure } from "@pcobooster/api/application/errors/external-service-failure";
import { Forbidden } from "@pcobooster/api/application/errors/forbidden";
import type { PlanningCenterAttachmentsService } from "@pcobooster/api/planning-center/services/attachments-service";
import type {
  PlanFile,
  PlanFileOpenInput,
  PlanFilesInput,
} from "@pcobooster/contracts/plan-files";
import {
  isString,
  isNumber,
  isNonEmptyString,
} from "@pcobooster/planning-center-models/json";
import type { JsonValue } from "@pcobooster/planning-center-models/json";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

const text = (value: JsonValue | undefined): string =>
  isString(value) ? value : "";
export const normalizePlanFile = (resource: PCResource): PlanFile => {
  const a = resource.attributes;
  const owner = resource.relationships?.attachable?.data;
  const attachable = owner && !Array.isArray(owner) ? owner : null;
  return {
    id: resource.id,
    name: text(a.display_name) || text(a.filename) || "Untitled file",
    filename: text(a.filename),
    contentType: text(a.content_type),
    fileType: text(a.filetype),
    providerType: text(a.pco_type),
    size: isNumber(a.file_size) && a.file_size >= 0 ? a.file_size : 0,
    hasPreview: a.has_preview === true,
    downloadable:
      a.downloadable === true &&
      !(
        (text(a.content_type).startsWith("audio/") || a.filetype === "audio") &&
        a.allow_mp3_download === false
      ),
    streamable: a.web_streamable === true,
    ownerType: attachable?.type ?? "Plan",
    ownerId: attachable?.id ?? null,
  };
};
export const listPlanFiles = (
  input: PlanFilesInput,
  attachments: Pick<PlanningCenterAttachmentsService, "list">
) =>
  attachments.list(input.serviceTypeId, input.planId, input.offset).pipe(
    Effect.map((response) => ({
      files: response.data.map(normalizePlanFile),
      nextOffset: isNonEmptyString(response.links?.next)
        ? (response.meta?.next?.offset ?? input.offset + response.data.length)
        : null,
    }))
  );

export const openPlanFile = (
  input: PlanFileOpenInput,
  attachments: Pick<PlanningCenterAttachmentsService, "open" | "get">
) =>
  Effect.gen(function* resolve() {
    const response = yield* attachments.get(
      input.serviceTypeId,
      input.planId,
      input.attachmentId
    );
    const file = normalizePlanFile(response.data);
    const preview =
      file.hasPreview &&
      (input.preview || (!file.downloadable && !file.streamable));
    if (
      !file.downloadable &&
      !file.streamable &&
      !preview &&
      !["AttachmentLink", "AttachmentYoutube"].includes(file.providerType)
    ) {
      return yield* new Forbidden({
        message:
          "Planning Center does not allow this file to be previewed or downloaded.",
      });
    }
    const opened = yield* attachments.open(
      input.serviceTypeId,
      input.planId,
      input.attachmentId,
      preview
    );
    const url = text(opened.data.attributes.attachment_url);
    try {
      const parsed = new URL(url);
      if (
        parsed.protocol === "https:" &&
        parsed.username === "" &&
        parsed.password === ""
      ) {
        return { url, preview };
      }
    } catch {
      // Malformed provider links are surfaced as an external failure.
    }
    return yield* new ExternalServiceFailure({
      message: "Planning Center did not return a secure file link.",
      service: "planning-center",
    });
  });
