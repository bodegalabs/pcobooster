import { createFileRoute, redirect } from "@tanstack/react-router";

/** A plan opens on its Overview. */
export const Route = createFileRoute(
  "/_app/services/$serviceTypeId/plans/$planId/"
)({
  beforeLoad: ({ params }) => {
    redirect({
      to: "/services/$serviceTypeId/plans/$planId/$view",
      params: { ...params, view: "overview" },
      throw: true,
    });
  },
});
