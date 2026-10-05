import type { ProductRpc } from "@pcobooster/contracts";
import { accessInputSchema } from "@pcobooster/contracts/access";
import {
  accountsListInputSchema,
  accountsSelectInputSchema,
} from "@pcobooster/contracts/accounts";
import {
  adjacentPlansInputSchema,
  organizationInputSchema,
  planInputSchema,
  plansInputSchema,
  serviceTypesInputSchema,
  teamPositionsInputSchema,
} from "@pcobooster/contracts/catalog";
import {
  chordChartCreateInputSchema,
  chordChartPdfInputSchema,
  chordChartSongCreateInputSchema,
  chordChartSongInputSchema,
  chordChartUpdateInputSchema,
  lyricsSearchInputSchema,
} from "@pcobooster/contracts/chord-charts";
import {
  demoExitInputSchema,
  demoStartInputSchema,
} from "@pcobooster/contracts/demo";
import { feedbackSubmitInputSchema } from "@pcobooster/contracts/feedback";
import { neededPositionsAdjustInputSchema } from "@pcobooster/contracts/needed-positions";
import {
  peopleBlockoutsInputSchema,
  peopleCandidateDetailsInputSchema,
  peopleDashboardActivityInputSchema,
  peopleDashboardPersonInputSchema,
  peopleMyScheduledPlansInputSchema,
  peoplePlanWindowHistoryInputSchema,
  peoplePositionCandidatesInputSchema,
  peopleSearchInputSchema,
} from "@pcobooster/contracts/people";
import {
  planItemsCreateInputSchema,
  planItemsDeleteInputSchema,
  planItemsListInputSchema,
  planItemsReorderInputSchema,
  planItemsUpdateInputSchema,
} from "@pcobooster/contracts/plan-items";
import { planPeopleUpdateTimesInputSchema } from "@pcobooster/contracts/plan-people";
import {
  planTimesCreateInputSchema,
  planTimesDeleteInputSchema,
  planTimesListInputSchema,
  planTimesUpdateInputSchema,
} from "@pcobooster/contracts/plan-times";
import {
  scheduleAssignInputSchema,
  scheduleRemoveInputSchema,
  scheduleUpdateStatusInputSchema,
} from "@pcobooster/contracts/schedule";
import { sessionStatusInputSchema } from "@pcobooster/contracts/session";
import {
  songsHistoryInputSchema,
  songsOptionsInputSchema,
  songsSearchInputSchema,
  songsSuggestionsInputSchema,
} from "@pcobooster/contracts/songs";
import { Schema } from "effect";
import type { RpcClient } from "effect/rpc";
import type { RpcClientError } from "effect/rpc/RpcClientError";

import type { Procedure, ProcedureInput } from "./rpc";

type NativeClient = RpcClient.FromGroup<typeof ProductRpc, RpcClientError>;
const invokeNeededPositions = (
  client: NativeClient,
  tag: Extract<Procedure, `neededPositions.${string}`>,
  input: ProcedureInput<Procedure>
) => {
  switch (tag) {
    case "neededPositions.adjust": {
      return client["neededPositions.adjust"](
        Schema.decodeUnknownSync(neededPositionsAdjustInputSchema)(input)
      );
    }
    default: {
      throw new Error("Unexpected procedure");
    }
  }
};
const invokePlanTimes = (
  client: NativeClient,
  tag: Extract<Procedure, `planTimes.${string}`>,
  input: ProcedureInput<Procedure>
) => {
  switch (tag) {
    case "planTimes.list": {
      return client["planTimes.list"](
        Schema.decodeUnknownSync(planTimesListInputSchema)(input)
      );
    }
    case "planTimes.create": {
      return client["planTimes.create"](
        Schema.decodeUnknownSync(planTimesCreateInputSchema)(input)
      );
    }
    case "planTimes.update": {
      return client["planTimes.update"](
        Schema.decodeUnknownSync(planTimesUpdateInputSchema)(input)
      );
    }
    case "planTimes.delete": {
      return client["planTimes.delete"](
        Schema.decodeUnknownSync(planTimesDeleteInputSchema)(input)
      );
    }
    default: {
      throw new Error("Unexpected procedure");
    }
  }
};
const invokeDemo = (
  client: NativeClient,
  tag: Extract<Procedure, `demo.${string}`>,
  input: ProcedureInput<Procedure>
) => {
  switch (tag) {
    case "demo.start": {
      return client["demo.start"](
        Schema.decodeUnknownSync(demoStartInputSchema)(input)
      );
    }
    case "demo.exit": {
      return client["demo.exit"](
        Schema.decodeUnknownSync(demoExitInputSchema)(input)
      );
    }
    default: {
      throw new Error("Unexpected procedure");
    }
  }
};
const invokeChordCharts = (
  client: NativeClient,
  tag: Extract<Procedure, `chordCharts.${string}`>,
  input: ProcedureInput<Procedure>
) => {
  switch (tag) {
    case "chordCharts.song": {
      return client["chordCharts.song"](
        Schema.decodeUnknownSync(chordChartSongInputSchema)(input)
      );
    }
    case "chordCharts.update": {
      return client["chordCharts.update"](
        Schema.decodeUnknownSync(chordChartUpdateInputSchema)(input)
      );
    }
    case "chordCharts.create": {
      return client["chordCharts.create"](
        Schema.decodeUnknownSync(chordChartCreateInputSchema)(input)
      );
    }
    case "chordCharts.createSong": {
      return client["chordCharts.createSong"](
        Schema.decodeUnknownSync(chordChartSongCreateInputSchema)(input)
      );
    }
    case "chordCharts.pdf": {
      return client["chordCharts.pdf"](
        Schema.decodeUnknownSync(chordChartPdfInputSchema)(input)
      );
    }
    case "chordCharts.lyricsSearch": {
      return client["chordCharts.lyricsSearch"](
        Schema.decodeUnknownSync(lyricsSearchInputSchema)(input)
      );
    }
    default: {
      throw new Error("Unexpected procedure");
    }
  }
};
const invokePlanPeople = (
  client: NativeClient,
  tag: Extract<Procedure, `planPeople.${string}`>,
  input: ProcedureInput<Procedure>
) => {
  switch (tag) {
    case "planPeople.updateTimes": {
      return client["planPeople.updateTimes"](
        Schema.decodeUnknownSync(planPeopleUpdateTimesInputSchema)(input)
      );
    }
    default: {
      throw new Error("Unexpected procedure");
    }
  }
};
const invokeSchedule = (
  client: NativeClient,
  tag: Extract<Procedure, `schedule.${string}`>,
  input: ProcedureInput<Procedure>
) => {
  switch (tag) {
    case "schedule.assign": {
      return client["schedule.assign"](
        Schema.decodeUnknownSync(scheduleAssignInputSchema)(input)
      );
    }
    case "schedule.remove": {
      return client["schedule.remove"](
        Schema.decodeUnknownSync(scheduleRemoveInputSchema)(input)
      );
    }
    case "schedule.updateStatus": {
      return client["schedule.updateStatus"](
        Schema.decodeUnknownSync(scheduleUpdateStatusInputSchema)(input)
      );
    }
    default: {
      throw new Error("Unexpected procedure");
    }
  }
};
const invokePeople = (
  client: NativeClient,
  tag: Extract<Procedure, `people.${string}`>,
  input: ProcedureInput<Procedure>
) => {
  switch (tag) {
    case "people.positionCandidates": {
      return client["people.positionCandidates"](
        Schema.decodeUnknownSync(peoplePositionCandidatesInputSchema)(input)
      );
    }
    case "people.planWindowHistory": {
      return client["people.planWindowHistory"](
        Schema.decodeUnknownSync(peoplePlanWindowHistoryInputSchema)(input)
      );
    }
    case "people.candidateDetails": {
      return client["people.candidateDetails"](
        Schema.decodeUnknownSync(peopleCandidateDetailsInputSchema)(input)
      );
    }
    case "people.search": {
      return client["people.search"](
        Schema.decodeUnknownSync(peopleSearchInputSchema)(input)
      );
    }
    case "people.blockouts": {
      return client["people.blockouts"](
        Schema.decodeUnknownSync(peopleBlockoutsInputSchema)(input)
      );
    }
    case "people.dashboardRoster": {
      return client["people.dashboardRoster"](
        Schema.decodeUnknownSync(Schema.Struct({}))(input)
      );
    }
    case "people.dashboardActivity": {
      return client["people.dashboardActivity"](
        Schema.decodeUnknownSync(peopleDashboardActivityInputSchema)(input)
      );
    }
    case "people.dashboardPerson": {
      return client["people.dashboardPerson"](
        Schema.decodeUnknownSync(peopleDashboardPersonInputSchema)(input)
      );
    }
    case "people.myScheduledPlans": {
      return client["people.myScheduledPlans"](
        Schema.decodeUnknownSync(peopleMyScheduledPlansInputSchema)(input)
      );
    }
    default: {
      throw new Error("Unexpected procedure");
    }
  }
};
const invokePlanItems = (
  client: NativeClient,
  tag: Extract<Procedure, `planItems.${string}`>,
  input: ProcedureInput<Procedure>
) => {
  switch (tag) {
    case "planItems.list": {
      return client["planItems.list"](
        Schema.decodeUnknownSync(planItemsListInputSchema)(input)
      );
    }
    case "planItems.create": {
      return client["planItems.create"](
        Schema.decodeUnknownSync(planItemsCreateInputSchema)(input)
      );
    }
    case "planItems.update": {
      return client["planItems.update"](
        Schema.decodeUnknownSync(planItemsUpdateInputSchema)(input)
      );
    }
    case "planItems.delete": {
      return client["planItems.delete"](
        Schema.decodeUnknownSync(planItemsDeleteInputSchema)(input)
      );
    }
    case "planItems.reorder": {
      return client["planItems.reorder"](
        Schema.decodeUnknownSync(planItemsReorderInputSchema)(input)
      );
    }
    default: {
      throw new Error("Unexpected procedure");
    }
  }
};
const invokeSongs = (
  client: NativeClient,
  tag: Extract<Procedure, `songs.${string}`>,
  input: ProcedureInput<Procedure>
) => {
  switch (tag) {
    case "songs.search": {
      return client["songs.search"](
        Schema.decodeUnknownSync(songsSearchInputSchema)(input)
      );
    }
    case "songs.suggestions": {
      return client["songs.suggestions"](
        Schema.decodeUnknownSync(songsSuggestionsInputSchema)(input)
      );
    }
    case "songs.library": {
      return client["songs.library"](
        Schema.decodeUnknownSync(Schema.Struct({}))(input)
      );
    }
    case "songs.history": {
      return client["songs.history"](
        Schema.decodeUnknownSync(songsHistoryInputSchema)(input)
      );
    }
    case "songs.options": {
      return client["songs.options"](
        Schema.decodeUnknownSync(songsOptionsInputSchema)(input)
      );
    }
    default: {
      throw new Error("Unexpected procedure");
    }
  }
};
const invokeFeatures = (
  client: NativeClient,
  tag: Extract<Procedure, `features.${string}`>,
  input: ProcedureInput<Procedure>
) => {
  switch (tag) {
    case "features.status": {
      return client["features.status"](
        Schema.decodeUnknownSync(Schema.Struct({}))(input)
      );
    }
    default: {
      throw new Error("Unexpected procedure");
    }
  }
};
const invokeSession = (
  client: NativeClient,
  tag: Extract<Procedure, `session.${string}`>,
  input: ProcedureInput<Procedure>
) => {
  switch (tag) {
    case "session.status": {
      return client["session.status"](
        Schema.decodeUnknownSync(sessionStatusInputSchema)(input)
      );
    }
    default: {
      throw new Error("Unexpected procedure");
    }
  }
};
const invokeAccess = (
  client: NativeClient,
  tag: Extract<Procedure, `access.${string}`>,
  input: ProcedureInput<Procedure>
) => {
  switch (tag) {
    case "access.me": {
      return client["access.me"](
        Schema.decodeUnknownSync(accessInputSchema)(input)
      );
    }
    default: {
      throw new Error("Unexpected procedure");
    }
  }
};
const invokeFeedback = (
  client: NativeClient,
  tag: Extract<Procedure, `feedback.${string}`>,
  input: ProcedureInput<Procedure>
) => {
  switch (tag) {
    case "feedback.submit": {
      return client["feedback.submit"](
        Schema.decodeUnknownSync(feedbackSubmitInputSchema)(input)
      );
    }
    default: {
      throw new Error("Unexpected procedure");
    }
  }
};
const invokeAccounts = (
  client: NativeClient,
  tag: Extract<Procedure, `accounts.${string}`>,
  input: ProcedureInput<Procedure>
) => {
  switch (tag) {
    case "accounts.list": {
      return client["accounts.list"](
        Schema.decodeUnknownSync(accountsListInputSchema)(input)
      );
    }
    case "accounts.select": {
      return client["accounts.select"](
        Schema.decodeUnknownSync(accountsSelectInputSchema)(input)
      );
    }
    default: {
      throw new Error("Unexpected procedure");
    }
  }
};
const invokeCatalog = (
  client: NativeClient,
  tag: Extract<Procedure, `catalog.${string}`>,
  input: ProcedureInput<Procedure>
) => {
  switch (tag) {
    case "catalog.serviceTypes": {
      return client["catalog.serviceTypes"](
        Schema.decodeUnknownSync(serviceTypesInputSchema)(input)
      );
    }
    case "catalog.plans": {
      return client["catalog.plans"](
        Schema.decodeUnknownSync(plansInputSchema)(input)
      );
    }
    case "catalog.plan": {
      return client["catalog.plan"](
        Schema.decodeUnknownSync(planInputSchema)(input)
      );
    }
    case "catalog.adjacentPlans": {
      return client["catalog.adjacentPlans"](
        Schema.decodeUnknownSync(adjacentPlansInputSchema)(input)
      );
    }
    case "catalog.organization": {
      return client["catalog.organization"](
        Schema.decodeUnknownSync(organizationInputSchema)(input)
      );
    }
    case "catalog.teamPositions": {
      return client["catalog.teamPositions"](
        Schema.decodeUnknownSync(teamPositionsInputSchema)(input)
      );
    }
    default: {
      throw new Error("Unexpected procedure");
    }
  }
};

const belongsTo = <Namespace extends string>(
  tag: Procedure,
  namespace: Namespace
): tag is Extract<Procedure, `${Namespace}.${string}`> =>
  tag.startsWith(`${namespace}.`);

/** Native clients retain each procedure's exact codec types at the Promise boundary. */
export const invokeProcedure = (
  client: NativeClient,
  tag: Procedure,
  input: ProcedureInput<Procedure>
) => {
  if (belongsTo(tag, "neededPositions")) {
    return invokeNeededPositions(client, tag, input);
  }
  if (belongsTo(tag, "planTimes")) {
    return invokePlanTimes(client, tag, input);
  }
  if (belongsTo(tag, "demo")) {
    return invokeDemo(client, tag, input);
  }
  if (belongsTo(tag, "chordCharts")) {
    return invokeChordCharts(client, tag, input);
  }
  if (belongsTo(tag, "planPeople")) {
    return invokePlanPeople(client, tag, input);
  }
  if (belongsTo(tag, "schedule")) {
    return invokeSchedule(client, tag, input);
  }
  if (belongsTo(tag, "people")) {
    return invokePeople(client, tag, input);
  }
  if (belongsTo(tag, "planItems")) {
    return invokePlanItems(client, tag, input);
  }
  if (belongsTo(tag, "songs")) {
    return invokeSongs(client, tag, input);
  }
  if (belongsTo(tag, "features")) {
    return invokeFeatures(client, tag, input);
  }
  if (belongsTo(tag, "session")) {
    return invokeSession(client, tag, input);
  }
  if (belongsTo(tag, "access")) {
    return invokeAccess(client, tag, input);
  }
  if (belongsTo(tag, "feedback")) {
    return invokeFeedback(client, tag, input);
  }
  if (belongsTo(tag, "accounts")) {
    return invokeAccounts(client, tag, input);
  }
  if (belongsTo(tag, "catalog")) {
    return invokeCatalog(client, tag, input);
  }
  throw new Error("Unknown product procedure");
};
