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
 * The ordered waypoint idents for a flight: the parsed `route` field when
 * present, coerced to start at `routeFrom` and end at `routeTo` (a `route`
 * that only lists the intermediate stops, or omits one endpoint, still
 * resolves correctly). Falls back to just `[routeFrom, routeTo]` when
 * there's no route text at all.
 */
export function routeWaypointIdents(
  routeFrom: string,
  routeTo: string,
  route: string | null | undefined,
): Array<string> {
  const from = routeFrom.trim().toUpperCase();
  const to = routeTo.trim().toUpperCase();
  const tokens = parseRouteIdents(route ?? '');

  if (tokens.length === 0) return [from, to].filter(Boolean);

  const withFrom = tokens[0] === from ? tokens : [from, ...tokens];
  const withEnds = withFrom[withFrom.length - 1] === to ? withFrom : [...withFrom, to];
  return withEnds.filter(Boolean);
}
