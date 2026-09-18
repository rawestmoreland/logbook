/**
 * Splits a free-text route string — ForeFlight's `Route` CSV column, or any
 * logbook's "full route" field — into ordered waypoint identifiers.
 * Whitespace, commas, semicolons, arrows, and dashes are all treated as
 * separators, covering the handful of ways a route actually gets typed or
 * exported: "KPAO KSQL KHWD", "KPAO-KSQL-KHWD", "KPAO > KSQL > KHWD".
 */
export function parseRouteIdents(route: string): Array<string> {
  return route
    .toUpperCase()
    .split(/[\s,;>-]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

/**
 * A route's first and last waypoint idents, for display contexts that still
 * want a single departure/arrival pair (e.g. a flight log's "From"/"To"
 * columns) rather than the full route text. Both are `''` for a blank
 * route; `to` equals `from` for a route with just one waypoint (a local
 * flight back to its origin).
 */
export function routeEndpoints(route: string | null | undefined): { from: string; to: string } {
  const idents = parseRouteIdents(route ?? '');
  return { from: idents[0] ?? '', to: idents[idents.length - 1] ?? '' };
}
