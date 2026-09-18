import { describe, expect, it } from 'vitest';
import { parseRouteIdents, routeEndpoints } from './route.js';

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

describe('routeEndpoints', () => {
  it('returns blank from/to when route is blank', () => {
    expect(routeEndpoints('')).toEqual({ from: '', to: '' });
    expect(routeEndpoints(null)).toEqual({ from: '', to: '' });
    expect(routeEndpoints(undefined)).toEqual({ from: '', to: '' });
  });

  it('returns the first and last waypoint of a multi-stop route', () => {
    expect(routeEndpoints('KPAO KSQL KHWD')).toEqual({ from: 'KPAO', to: 'KHWD' });
  });

  it('returns the same ident for both ends of a single-waypoint route', () => {
    expect(routeEndpoints('KPAO')).toEqual({ from: 'KPAO', to: 'KPAO' });
  });
});
