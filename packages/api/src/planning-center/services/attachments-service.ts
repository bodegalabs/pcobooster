import type { PlanningCenterCoreClient } from "@pcobooster/api/planning-center/core-client";

/** Plan-scoped paths let Planning Center enforce attachment visibility with the caller's credential. */
export class PlanningCenterAttachmentsService {
  private readonly core: PlanningCenterCoreClient;
  constructor(core: PlanningCenterCoreClient) {
    this.core = core;
  }

  list(serviceTypeId: string, planId: string, offset: number) {
    return this.core.fetchCollection(
      `/services/v2/service_types/${serviceTypeId}/plans/${planId}/all_attachments?per_page=100&offset=${String(offset)}`
    );
  }

  get(serviceTypeId: string, planId: string, attachmentId: string) {
    return this.core.fetch(
      `/services/v2/service_types/${serviceTypeId}/plans/${planId}/all_attachments/${attachmentId}`
    );
  }

  open(
    serviceTypeId: string,
    planId: string,
    attachmentId: string,
    preview: boolean
  ) {
    return this.core.fetch(
      `/services/v2/service_types/${serviceTypeId}/plans/${planId}/all_attachments/${attachmentId}/${preview ? "preview" : "open"}`,
      { method: "POST", body: {}, readAction: true }
    );
  }
}
