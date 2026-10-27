import { z } from "zod";

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(200).optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const idSchema = z.string().min(1).max(64);

/** Empty strings from HTML inputs become null. */
export const optionalText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const optionalId = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null));

export function paginate(query: Pick<PaginationQuery, "page" | "pageSize">) {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}
