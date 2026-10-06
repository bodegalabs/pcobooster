import { z } from "zod";

export const sessionStatusInputSchema = z.object({});
export const sessionStatusSchema = z.object({ authenticated: z.boolean() });

export type SessionStatus = z.output<typeof sessionStatusSchema>;
