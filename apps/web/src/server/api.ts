import {
  adminAccountsResponseSchema,
  adminUserResponseSchema,
  sessionStatusSchema,
} from "@worship-admin/api/admin-contracts";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { z } from "zod";

const firstForwardedValue = (value: string | null): string | null => {
  const first = value?.split(",", 1)[0]?.trim() ?? null;
  return first !== null && first !== "" ? first : null;
};

const apiRequest = async (path: string): Promise<Response> => {
  const incomingHeaders = await headers();
  const host =
    firstForwardedValue(incomingHeaders.get("x-forwarded-host")) ??
    incomingHeaders.get("host");
  if (host === null || host === "") {
    throw new Error("Unable to resolve the web request host");
  }

  const protocol =
    firstForwardedValue(incomingHeaders.get("x-forwarded-proto")) ??
    (process.env.NODE_ENV === "production" ? "https" : "http");
  const forwardedHeaders = new Headers();
  const cookie = incomingHeaders.get("cookie");
  if (cookie !== null && cookie !== "") {
    forwardedHeaders.set("cookie", cookie);
  }

  const response = await fetch(`${protocol}://${host}${path}`, {
    cache: "no-store",
    headers: forwardedHeaders,
  });
  if (response.status === 401) {
    redirect("/auth");
  }
  if (response.status === 403 || response.status === 404) {
    notFound();
  }
  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }
  return response;
};

const parseResponse = async <T>(
  response: Response,
  schema: z.ZodType<T>
): Promise<T> => schema.parse(await response.json());

export const getSessionStatus = async () =>
  await parseResponse(await apiRequest("/api/session"), sessionStatusSchema);

export const getAdminAccounts = async () =>
  await parseResponse(
    await apiRequest("/api/admin/accounts"),
    adminAccountsResponseSchema
  );

export const getAdminUser = async (userId: string) =>
  await parseResponse(
    await apiRequest(`/api/admin/users/${encodeURIComponent(userId)}`),
    adminUserResponseSchema
  );
