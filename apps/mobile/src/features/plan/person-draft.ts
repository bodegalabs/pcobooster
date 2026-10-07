import type { RosterAssignment } from "./assignment";
import { personStatus } from "./roster";
import type { PersonStatus } from "./roster";

export interface PersonDraftWriter {
  readonly setStatus: (
    assignment: RosterAssignment,
    status: PersonStatus
  ) => Promise<boolean>;
}
/** Save a changed draft once on close; unscheduling discards it. */
export class PersonDraft {
  readonly assignment: RosterAssignment;
  readonly initialStatus: PersonStatus;
  status: PersonStatus;
  private committed = false;
  private discarded = false;
  constructor(assignment: RosterAssignment) {
    this.assignment = assignment;
    this.initialStatus = personStatus(assignment.person);
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
    await writer.setStatus(this.assignment, this.status);
  }
}
