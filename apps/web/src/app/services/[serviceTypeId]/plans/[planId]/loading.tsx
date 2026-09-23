import { SchedulePlanWorkspaceFallback } from "@/components/schedule/schedule-page-fallbacks";

// Scoped to the plan segment so opening a plan shows this shell instantly,
// while switching views inside the plan keeps the current view on screen.
const PlanWorkspaceLoading = () => <SchedulePlanWorkspaceFallback />;

export default PlanWorkspaceLoading;
