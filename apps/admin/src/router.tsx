import { createRouter } from "@tanstack/react-router";

import { routeTree } from "@/routeTree.gen";

export const getRouter = () =>
  createRouter({
    routeTree,
    // Show page skeletons as soon as a navigation waits on server data, without a minimum.
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
    scrollRestoration: true,
  });
