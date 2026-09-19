import { describe, expect, it } from 'vitest';
import { parseRouteIdents, routeWaypointIdents } from './route.js';

describe('parseRouteIdents', () => {
  it('splits on whitespace', () => {
    expect(parseRouteIdents('kpao ksql khwd')).toEqual(['KPAO', 'KSQL', 'KHWD']);
  });

  it('splits on dashes, commas, semicolons, and arrows', () => {
    expect(parseRouteIdents('KPAO-KSQL-KHWD')).toEqual(['KPAO', 'KSQL', 'KHWD']);
    expect(parseRouteIdents('KPAO,KSQL,KHWD')).toEqual(['KPAO', 'KSQL', 'KHWD']);
    expect(parseRouteIdents('KPAO;KSQL;KHWD')).toEqual(['KPAO', 'KSQL', 'KHWD']);
    expect(parseRouteIdents('KPAO > KSQL > KHWD')).toEqual(['KPAO', 'KSQL', 'KHWD']);
  });

  it('collapses repeated separators and trims', () => {
    expect(parseRouteIdents('  KPAO   --  KSQL  ')).toEqual(['KPAO', 'KSQL']);
  });

  it('returns an empty array for blank input', () => {
    expect(parseRouteIdents('')).toEqual([]);
    expect(parseRouteIdents('   ')).toEqual([]);
  });
});

describe('routeWaypointIdents', () => {
  it('falls back to [routeFrom, routeTo] when route is blank', () => {
    expect(routeWaypointIdents('kpao', 'kmry', '')).toEqual(['KPAO', 'KMRY']);
    expect(routeWaypointIdents('kpao', 'kmry', null)).toEqual(['KPAO', 'KMRY']);
    expect(routeWaypointIdents('kpao', 'kmry', undefined)).toEqual(['KPAO', 'KMRY']);
  });

  it('uses the parsed route as-is when it already starts and ends at routeFrom/routeTo', () => {
    expect(routeWaypointIdents('kpao', 'khwd', 'KPAO KSQL KHWD')).toEqual(['KPAO', 'KSQL', 'KHWD']);
  });

  it('prepends routeFrom when the route only lists intermediate stops', () => {
    expect(routeWaypointIdents('kpao', 'khwd', 'KSQL KHWD')).toEqual(['KPAO', 'KSQL', 'KHWD']);
  });

  it('appends routeTo when the route is missing the destination', () => {
    expect(routeWaypointIdents('kpao', 'khwd', 'KPAO KSQL')).toEqual(['KPAO', 'KSQL', 'KHWD']);
  });

  it('adds both ends when the route is only the intermediate stop', () => {
    expect(routeWaypointIdents('kpao', 'khwd', 'KSQL')).toEqual(['KPAO', 'KSQL', 'KHWD']);
  });
});
