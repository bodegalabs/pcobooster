/** Validated local data uses the same scoped cache and revocable storage lease as API reads. */
import { Schema } from "effect";

const id = Schema.String.check(
  Schema.isPattern(/^[\w-]+$/u),
  Schema.isMaxLength(160)
);
const label = Schema.String.check(Schema.isMaxLength(300));
const detail = Schema.String.check(Schema.isMaxLength(400));
export const searchRecentSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("query"),
    text: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80)),
  }),
  Schema.Struct({
    kind: Schema.Literal("plans"),
    id,
    serviceTypeId: id,
    title: label,
    detail,
  }),
  Schema.Struct({
    kind: Schema.Literals(["people", "songs"]),
    id,
    title: label,
    detail,
  }),
]);
export type SearchRecent = typeof searchRecentSchema.Type;
export const peoplePreferencesSchema = Schema.Struct({
  scope: Schema.NullOr(
    Schema.Union([
      Schema.Literals(["mine", "all"]),
      Schema.String.check(
        Schema.isPattern(/^team:[\w-]+$/u),
        Schema.isMaxLength(165)
      ),
    ])
  ),
  view: Schema.Literals(["list", "month"]),
});
export type PeoplePreferences = typeof peoplePreferencesSchema.Type;
export const localQuerySchemas = {
  "songs.recent": Schema.Array(
    Schema.Struct({ id, title: label, author: label })
  ).check(Schema.isMaxLength(8)),
  "search.recent": Schema.Array(searchRecentSchema).check(
    Schema.isMaxLength(10)
  ),
  "people.preferences": peoplePreferencesSchema,
} satisfies Readonly<Record<string, Schema.Top>>;
