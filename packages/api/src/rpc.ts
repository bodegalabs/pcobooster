import { accessRouter } from "@pcobooster/api/transport/rpc/access";
import { catalogRouter } from "@pcobooster/api/transport/rpc/catalog";
import { chordChartsRouter } from "@pcobooster/api/transport/rpc/chord-charts";
import { demoRouter } from "@pcobooster/api/transport/rpc/demo";
import { feedbackRouter } from "@pcobooster/api/transport/rpc/feedback";
import { identityRouter } from "@pcobooster/api/transport/rpc/identity";
import { neededPositionsRouter } from "@pcobooster/api/transport/rpc/needed-positions";
import { peopleRouter } from "@pcobooster/api/transport/rpc/people";
import { planItemsRouter } from "@pcobooster/api/transport/rpc/plan-items";
import {
  planPeopleRouter,
  planTimesRouter,
} from "@pcobooster/api/transport/rpc/plan-times";
import { scheduleRouter } from "@pcobooster/api/transport/rpc/schedule";
import { songsRouter } from "@pcobooster/api/transport/rpc/songs";
import { ProductRpc } from "@pcobooster/contracts/router";

export const productHandlers = ProductRpc.of({
  "access.me": accessRouter.me,
  "accounts.list": identityRouter.accounts.list,
  "accounts.select": identityRouter.accounts.select,
  "catalog.serviceTypes": catalogRouter.serviceTypes,
  "catalog.plans": catalogRouter.plans,
  "catalog.plan": catalogRouter.plan,
  "catalog.adjacentPlans": catalogRouter.adjacentPlans,
  "catalog.organization": catalogRouter.organization,
  "catalog.teamPositions": catalogRouter.teamPositions,
  "chordCharts.song": chordChartsRouter.song,
  "chordCharts.update": chordChartsRouter.update,
  "chordCharts.create": chordChartsRouter.create,
  "chordCharts.createSong": chordChartsRouter.createSong,
  "chordCharts.pdf": chordChartsRouter.pdf,
  "chordCharts.lyricsSearch": chordChartsRouter.lyricsSearch,
  "demo.start": demoRouter.start,
  "demo.exit": demoRouter.exit,
  "features.status": identityRouter.features.status,
  "feedback.submit": feedbackRouter.submit,
  "neededPositions.adjust": neededPositionsRouter.adjust,
  "people.positionCandidates": peopleRouter.positionCandidates,
  "people.planWindowHistory": peopleRouter.planWindowHistory,
  "people.candidateDetails": peopleRouter.candidateDetails,
  "people.search": peopleRouter.search,
  "people.blockouts": peopleRouter.blockouts,
  "people.dashboardRoster": peopleRouter.dashboardRoster,
  "people.dashboardActivity": peopleRouter.dashboardActivity,
  "people.dashboardPerson": peopleRouter.dashboardPerson,
  "people.myScheduledPlans": peopleRouter.myScheduledPlans,
  "planItems.list": planItemsRouter.list,
  "planItems.create": planItemsRouter.create,
  "planItems.update": planItemsRouter.update,
  "planItems.delete": planItemsRouter.delete,
  "planItems.reorder": planItemsRouter.reorder,
  "planPeople.updateTimes": planPeopleRouter.updateTimes,
  "planTimes.list": planTimesRouter.list,
  "planTimes.create": planTimesRouter.create,
  "planTimes.update": planTimesRouter.update,
  "planTimes.delete": planTimesRouter.delete,
  "session.status": identityRouter.session.status,
  "schedule.assign": scheduleRouter.assign,
  "schedule.remove": scheduleRouter.remove,
  "schedule.updateStatus": scheduleRouter.updateStatus,
  "songs.search": songsRouter.search,
  "songs.suggestions": songsRouter.suggestions,
  "songs.library": songsRouter.library,
  "songs.history": songsRouter.history,
  "songs.options": songsRouter.options,
});
