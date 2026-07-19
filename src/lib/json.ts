import type { Prisma } from "@prisma/client";

/**
 * Prisma's InputJsonValue requires an index signature, which our precisely-typed
 * interfaces (PageBody, ThemeTokens, ThemeLayout) deliberately don't have —
 * being specific about the shape is the point. These two helpers are the one
 * place that boundary is crossed, so the cast is named rather than scattered
 * as `as never` across every call site.
 */
export const toJson = <T>(value: T): Prisma.InputJsonValue =>
  value as unknown as Prisma.InputJsonValue;

export const fromJson = <T>(value: unknown): T => value as unknown as T;
