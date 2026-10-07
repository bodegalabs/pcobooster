import {
  buildDraft,
  parseLengthText,
} from "@pcobooster/planning-center-models/plan-item-draft";
import type { DraftState } from "@pcobooster/planning-center-models/plan-item-draft";
import {
  applyPlanItemDraft,
  planItemDraftChangesItem,
} from "@pcobooster/planning-center-models/plan-item-order";
import type {
  PlanItem,
  SongOptionSet,
} from "@pcobooster/planning-center-models/types";

import type { PlanContentWriter } from "../content-writes";
import { pickedSong } from "./formatting";

/**
 * One open item form. Each requested draft reserves its place in the plan's write queue,
 * then diffs against the last acknowledged item. Pending and refused drafts are not resent unchanged.
 */
export class ItemDraft {
  draft: DraftState;
  /** The item as Planning Center last acknowledged it. */
  private item: PlanItem;
  /** The song's arrangements once loaded, read at save so the chosen arrangement and key paint at once. */
  private readonly options?: () => SongOptionSet | undefined;
  private discarded = false;
  private requested: DraftState | null = null;
  private refused: DraftState | null = null;
  constructor(item: PlanItem, options?: () => SongOptionSet | undefined) {
    this.item = item;
    this.options = options;
    this.draft = buildDraft(item);
    if (item.length === null) {
      this.draft.lengthText = "";
    }
  }
  change(patch: Partial<DraftState>): DraftState {
    this.draft = { ...this.draft, ...patch };
    return this.draft;
  }
  discard(): void {
    this.discarded = true;
  }
  /** Why the draft can't save (an unreadable length), or null. */
  get problem(): string | null {
    return parseLengthText(this.draft.lengthText).error;
  }
  private selection(): Pick<PlanItem, "arrangement" | "key"> {
    const { arrangementId, keyId } = this.draft;
    const option = this.options?.()?.arrangements.find(
      (value) => value.id === arrangementId
    );
    return pickedSong(
      this.item,
      arrangementId === "" ? null : option,
      keyId === "" ? null : option?.keys.find((value) => value.id === keyId)
    );
  }
  /** Queues a save of the draft; resolves with why it can't save, or null. */
  async commit(writer: PlanContentWriter): Promise<string | null> {
    if (
      this.discarded ||
      this.draft === this.refused ||
      this.draft === this.requested
    ) {
      return null;
    }
    const { problem } = this;
    if (problem !== null) {
      return problem;
    }
    await this.send(writer, this.draft);
    return null;
  }
  private async send(
    writer: PlanContentWriter,
    draft: DraftState
  ): Promise<boolean> {
    const { item } = this;
    const parsed = parseLengthText(draft.lengthText);
    const comparable = {
      ...draft,
      arrangementId: draft.arrangementId || undefined,
      keyId: draft.keyId || undefined,
    };
    if (this.discarded || draft === this.refused || parsed.error !== null) {
      return true;
    }
    const { arrangement, key } = this.selection();
    const updated = applyPlanItemDraft(
      item,
      draft,
      parsed.length,
      arrangement,
      key
    );
    this.requested = draft;
    const saved = await writer.updateItem(
      {
        prepare: () => {
          if (
            this.discarded ||
            draft === this.refused ||
            !planItemDraftChangesItem(this.item, comparable, parsed.length)
          ) {
            return null;
          }
          return {
            itemId: item.id,
            title: item.song === null ? draft.title : undefined,
            description: draft.description,
            servicePosition: updated.servicePosition,
            length: item.itemType === "header" ? undefined : parsed.length,
            arrangementId:
              draft.arrangementId === "" ? null : draft.arrangementId,
            keyId: draft.keyId === "" ? null : draft.keyId,
          };
        },
        acknowledge: () => {
          this.item = updated;
        },
      },
      updated
    );
    if (this.requested === draft) {
      this.requested = null;
    }
    if (!saved) {
      this.refused = draft;
    }
    return saved;
  }
}
