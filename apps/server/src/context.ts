import { auth } from "@worship-admin/api/auth";

export const createContext = async ({ request }: { request: Request }) => ({
  headers: request.headers,
  session: await auth.api.getSession({ headers: request.headers }),
});

export type AppContext = Awaited<ReturnType<typeof createContext>>;
