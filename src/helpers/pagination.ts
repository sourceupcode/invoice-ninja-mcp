// Pagination header formatting.
//
// v5 wraps the paginator: the envelope is
//
//   { "data": [...], "meta": { "pagination": { "total": 4, "count": 2,
//     "per_page": 2, "current_page": 1, "total_pages": 2, "links": {...} } } }
//
// Every list tool originally read `meta.current_page` directly, so the header
// rendered "Showing page undefined of undefined (undefined total)" on every
// call — verified against the live API, which nests the counters one level
// deeper under `pagination`. Entities that are included in a response also
// carry their own empty `meta`, which is what made the mistake easy to miss.
//
// This helper accepts either shape so an older/newer serializer cannot bring
// the "undefined" header back.

interface PaginationShape {
  total?: number;
  count?: number;
  per_page?: number;
  current_page?: number;
  total_pages?: number;
}

export function formatPagination(
  meta: unknown,
  shownCount: number,
  noun: string,
): string {
  const raw = (meta ?? {}) as Record<string, unknown>;
  // Prefer the wrapped form; fall back to a flat one if it is ever returned.
  const p = (raw.pagination ?? raw) as PaginationShape;

  const page = p.current_page;
  const pages = p.total_pages;
  const total = p.total;

  if (typeof total === "number") {
    const where =
      typeof page === "number" && typeof pages === "number"
        ? `page ${page} of ${pages}`
        : `${shownCount} on this page`;
    return `Showing ${where} (${total} ${noun} total)`;
  }

  return `Found ${shownCount} ${noun}`;
}
