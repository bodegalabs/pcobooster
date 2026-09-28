import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";

/** The sidebar renders open unless the visitor closed it (the `sidebar_state` cookie). */
export const getSidebarDefaultOpen = createServerFn({ method: "GET" }).handler(
  () => getCookie("sidebar_state") !== "false"
);
