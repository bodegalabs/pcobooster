import type { FilledPositionPerson } from "@pcobooster/planning-center-models/types";

import { personStatus } from "./roster";
import type { PersonStatus } from "./roster";

export interface PersonDraftWriter {
  readonly setStatus: (
    person: FilledPositionPerson,
    status: PersonStatus
  ) => Promise<boolean>;
}
/** Save a changed draft once on close; unscheduling discards it. */
export class PersonDraft {
  readonly person: FilledPositionPerson;
  readonly initialStatus: PersonStatus;
  status: PersonStatus;
  private committed = false;
  private discarded = false;
  constructor(person: FilledPositionPerson) {
    this.person = person;
    this.initialStatus = personStatus(person);
    this.status = this.initialStatus;
  }
  discard(): void {
    this.discarded = true;
  }
  async commit(writer: PersonDraftWriter): Promise<void> {
    if (
      this.committed ||
      this.discarded ||
      this.status === this.initialStatus
    ) {
      return;
    }
    this.committed = true;
    await writer.setStatus(this.person, this.status);
  }
}
