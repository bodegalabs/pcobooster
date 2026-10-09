/** Who a Planning Center account belongs to. */
import { Schema } from "effect";

export const planningCenterIdentitySchema = Schema.Struct({
  sub: Schema.NullOr(Schema.String),
  name: Schema.NullOr(Schema.String),
  email: Schema.NullOr(Schema.String),
  organizationId: Schema.NullOr(Schema.String),
  organizationName: Schema.NullOr(Schema.String),
});

export type PlanningCenterIdentity = typeof planningCenterIdentitySchema.Type;
