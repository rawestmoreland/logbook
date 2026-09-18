import { describe, expect, it } from 'vitest';

import { parseFlightsCsv } from './csv.js';
import {
  convertForeFlightCsv,
  extractForeFlightAircraftTable,
  foreflightEquipmentTypeToInstanceType,
  isForeFlightCsv,
} from './csv-foreflight.js';

// A small fixture structurally faithful to a real ForeFlight logbook
// export (header names, column order, blank-row separator, quoted
// comments), but with only a handful of aircraft/flights.
const FOREFLIGHT_CSV = [
  'ForeFlight Logbook Import,,,,,,,,,,,,,,',
  ',,,,,,,,,,,,,,',
  'Aircraft Table,,,,,,,,,,,,,,',
  'AircraftID,EquipmentType,TypeCode,Year,Make,Model,Category,Class,GearType,EngineType,Complex,TAA,HighPerformance,Pressurized',
  'N40LF,aircraft,C162,2015,CESSNA AIRCRAFT CO,C162,airplane,airplane_single_engine_land,retractable_tricycle,Piston,false,false,false,false',
  'N345TJ,aircraft,C182,,Cessna Aircraft,182 Skylane,airplane,airplane_single_engine_land,fixed_tricycle,Piston,false,false,true,false',
  'N172BW,aircraft,,,,,,,,,false,false,false,false',
  'N700RB,aatd,,,Redbird,MCX,,,,,false,false,false,false',
  ',,,,,,,,,,,,,,',
  'Flights Table,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,',
  'Date,AircraftID,From,To,Route,TimeOut,TimeOff,TimeOn,TimeIn,OnDuty,OffDuty,TotalTime,PIC,SIC,Night,Solo,CrossCountry,NVG,NVG Ops,Distance,DayTakeoffs,DayLandingsFullStop,NightTakeoffs,NightLandingsFullStop,AllLandings,ActualInstrument,SimulatedInstrument,HobbsStart,HobbsEnd,TachStart,TachEnd,Holds,Approach1,Approach2,Approach3,Approach4,Approach5,Approach6,DualGiven,DualReceived,SimulatedFlight,GroundTraining,InstructorName,InstructorComments,Person1,Person2,Person3,Person4,Person5,Person6,FlightReview,Checkride,IPC,NVG Proficiency,FAA6158,PilotComments',
  '2022-06-18,N40LF,KEFD,KEFD,T41,,,,,,,1.3,1.3,0.0,0.0,0.0,0.0,0.0,0,0.00,4,4,0,0,4,0.0,0.0,0.00,0.00,0.00,0.00,0,,,,,,,1.3,0.0,0.0,0.0,,,,,,,,,false,false,false,false,false,',
  '2022-03-13,N345TJ,KDWH,KDWH,,,,,,,,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0,0.00,0,0,0,0,0,0.0,1.3,0.00,0.00,0.00,0.00,3,1;RNAV (GPS) RWY 17R;17R;KDWH;;,1;RNAV (GPS) RWY 32;32;T82;;,1;ILS OR LOC RWY 17;17;KLBX;;,,,,0.0,1.5,1.5,0.0,Cotton Feray,,,,,,,,false,false,true,false,false,',
  // N172BW: all touch-and-goes, no full-stop landings — DayLandingsFullStop
  // is 0 but AllLandings is 3, the case that used to read as zero total
  // landings entirely (see the totalLandings test below).
  '2011-09-16,N172BW,KDWH,KDWH,KDWH,,,,,,,1.4,,,,,,,,,3,0,,,3,,,,,,,,,,,,,,,1.4,,,,,,,,,,,false,false,false,false,false,"""ENGFAILURES,SIMINST,VORTRACKING"""',
].join('\n');

describe('isForeFlightCsv', () => {
  it('detects a ForeFlight export by its first line', () => {
    expect(isForeFlightCsv(FOREFLIGHT_CSV)).toBe(true);
  });

  it('does not flag a native-shaped CSV', () => {
    expect(isForeFlightCsv('Date,Tail Number,Model,From,To,Total Time\n2026-01-01,N1,X,KPAO,KMRY,1.0')).toBe(
      false,
    );
  });
});

describe('convertForeFlightCsv', () => {
  it('reshapes the Flights Table into native rows, using the Aircraft Table for Model text', () => {
    const { csvText: native } = convertForeFlightCsv(FOREFLIGHT_CSV);
    const { rows, errors } = parseFlightsCsv(native);

    expect(errors).toEqual([]);
    expect(rows).toHaveLength(3);

    const n40lf = rows.find((r) => r.values.tailNumber === 'N40LF')!;
    expect(n40lf.values.model).toBe('CESSNA AIRCRAFT CO C162');
    expect(n40lf.values.date).toBe('2022-06-18');
    expect(n40lf.values.routeFrom).toBe('KEFD');
    expect(n40lf.values.totalTime).toBe('1.3');
    expect(n40lf.values.picTime).toBe('1.3');
    expect(n40lf.values.totalLandings).toBe('4');
    expect(n40lf.values.dayLandingsFullStop).toBe('4');
  });

  it('maps the Route column into route', () => {
    const { csvText: native } = convertForeFlightCsv(FOREFLIGHT_CSV);
    const { rows } = parseFlightsCsv(native);
    const n40lf = rows.find((r) => r.values.tailNumber === 'N40LF')!;
    expect(n40lf.values.route).toBe('T41');
  });

  it('maps totalLandings from AllLandings, not the full-stop sum, so touch-and-goes still count', () => {
    const { csvText: native } = convertForeFlightCsv(FOREFLIGHT_CSV);
    const { rows } = parseFlightsCsv(native);
    // N172BW was all touch-and-goes: DayLandingsFullStop is 0, but
    // AllLandings is 3 — totalLandings must follow AllLandings.
    const n172bw = rows.find((r) => r.values.tailNumber === 'N172BW')!;
    expect(n172bw.values.dayLandingsFullStop).toBe('0');
    expect(n172bw.values.totalLandings).toBe('3');
  });

  it('falls back to blank model text for a tail missing from the Aircraft Table', () => {
    const { csvText: native } = convertForeFlightCsv(FOREFLIGHT_CSV);
    const { rows } = parseFlightsCsv(native);
    // N172BW's Aircraft Table row has no Make/Model at all.
    const n172bw = rows.find((r) => r.values.tailNumber === 'N172BW')!;
    expect(n172bw.values.model).toBe('');
  });

  it('counts populated Approach columns rather than reading a single count field', () => {
    const { csvText: native } = convertForeFlightCsv(FOREFLIGHT_CSV);
    const { rows } = parseFlightsCsv(native);
    const n345tj = rows.find((r) => r.values.tailNumber === 'N345TJ')!;
    expect(n345tj.values.approaches).toBe('3');
  });

  it('treats a nonzero Holds count as holding: true', () => {
    const { csvText: native } = convertForeFlightCsv(FOREFLIGHT_CSV);
    const { rows } = parseFlightsCsv(native);
    const n345tj = rows.find((r) => r.values.tailNumber === 'N345TJ')!;
    expect(n345tj.values.holding).toBe(true);

    const n40lf = rows.find((r) => r.values.tailNumber === 'N40LF')!;
    expect(n40lf.values.holding).toBe(false);
  });

  it('maps DualReceived into dualTime', () => {
    const { csvText: native } = convertForeFlightCsv(FOREFLIGHT_CSV);
    const { rows } = parseFlightsCsv(native);
    const n172bw = rows.find((r) => r.values.tailNumber === 'N172BW')!;
    expect(n172bw.values.dualTime).toBe('1.4');
  });

  it('maps CrossCountry, DualGiven, and SimulatedFlight into crossCountryTime/dualGivenTime/groundSimTime', () => {
    const { csvText: native } = convertForeFlightCsv(FOREFLIGHT_CSV);
    const { rows } = parseFlightsCsv(native);
    // N40LF: CrossCountry 0.0, DualGiven 1.3, SimulatedFlight 0.0.
    const n40lf = rows.find((r) => r.values.tailNumber === 'N40LF')!;
    expect(n40lf.values.crossCountryTime).toBe('0.0');
    expect(n40lf.values.dualGivenTime).toBe('1.3');
    expect(n40lf.values.groundSimTime).toBe('0.0');

    // N345TJ: CrossCountry 0.0, DualGiven 0.0, SimulatedFlight 1.5.
    const n345tj = rows.find((r) => r.values.tailNumber === 'N345TJ')!;
    expect(n345tj.values.crossCountryTime).toBe('0.0');
    expect(n345tj.values.dualGivenTime).toBe('0.0');
    expect(n345tj.values.groundSimTime).toBe('1.5');
  });

  it('round-trips a doubly-quoted ForeFlight comment into remarks without crashing', () => {
    const { csvText: native } = convertForeFlightCsv(FOREFLIGHT_CSV);
    const { rows, errors } = parseFlightsCsv(native);
    expect(errors).toEqual([]);
    const n172bw = rows.find((r) => r.values.tailNumber === 'N172BW')!;
    expect(n172bw.values.remarks).toContain('ENGFAILURES,SIMINST,VORTRACKING');
  });

  it('handles a Flights Table with no blank separator row before it', () => {
    const noSeparator = FOREFLIGHT_CSV.replace(/\n,,,,,,,,,,,,,,\nFlights Table/, '\nFlights Table');
    const { csvText: native } = convertForeFlightCsv(noSeparator);
    const { rows, errors } = parseFlightsCsv(native);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(3);
  });

  it('skips a legacy data-type row between a marker and its header row', () => {
    const withTypeRow = FOREFLIGHT_CSV.replace(
      'Flights Table,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,\nDate,AircraftID',
      'Flights Table,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,\nText,Text,Text,Text\nDate,AircraftID',
    );
    const { csvText: native } = convertForeFlightCsv(withTypeRow);
    const { rows, errors } = parseFlightsCsv(native);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(3);
  });

  it('throws a clear error when no Flights Table can be found', () => {
    expect(() => convertForeFlightCsv('ForeFlight Logbook Import\nAircraft Table\nAircraftID\nN1')).toThrow(
      /Flights Table/,
    );
  });

  it('suggests an instance type per tail from the Aircraft Table EquipmentType column', () => {
    const { instanceTypeHintByTail } = convertForeFlightCsv(FOREFLIGHT_CSV);
    expect(instanceTypeHintByTail.get('N700RB')).toBe('certified_atd');
    // "aircraft" and blank both default to 'real'.
    expect(instanceTypeHintByTail.get('N40LF')).toBe('real');
    expect(instanceTypeHintByTail.get('N172BW')).toBe('real');
  });
});

describe('extractForeFlightAircraftTable', () => {
  it('extracts one row per tail from the Aircraft Table, ignoring the Flights Table', () => {
    const { rows, errors } = extractForeFlightAircraftTable(FOREFLIGHT_CSV);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(4);

    const n40lf = rows.find((r) => r.tailNumber === 'N40LF')!;
    expect(n40lf.modelText).toBe('CESSNA AIRCRAFT CO C162');
    expect(n40lf.instanceType).toBe('real');

    const n700rb = rows.find((r) => r.tailNumber === 'N700RB')!;
    expect(n700rb.modelText).toBe('Redbird MCX');
    expect(n700rb.instanceType).toBe('certified_atd');
  });

  it('leaves modelText blank for a tail missing Make/Model', () => {
    const { rows } = extractForeFlightAircraftTable(FOREFLIGHT_CSV);
    const n172bw = rows.find((r) => r.tailNumber === 'N172BW')!;
    expect(n172bw.modelText).toBe('');
  });

  it('returns no rows (not an error) when there is no Aircraft Table', () => {
    const { rows, errors } = extractForeFlightAircraftTable('ForeFlight Logbook Import\nFlights Table\nDate\n2026-01-01');
    expect(rows).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('works from just the Aircraft Table section, without a Flights Table at all', () => {
    const aircraftTableOnly = [
      'ForeFlight Logbook Import,,,,',
      ',,,,',
      'Aircraft Table,,,,',
      'AircraftID,EquipmentType,Make,Model,',
      'N40LF,aircraft,CESSNA AIRCRAFT CO,C162,',
    ].join('\n');
    const { rows, errors } = extractForeFlightAircraftTable(aircraftTableOnly);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tailNumber).toBe('N40LF');
    expect(rows[0]!.modelText).toBe('CESSNA AIRCRAFT CO C162');
  });
});

describe('foreflightEquipmentTypeToInstanceType', () => {
  it('maps known device-class codes', () => {
    expect(foreflightEquipmentTypeToInstanceType('aatd')).toBe('certified_atd');
    expect(foreflightEquipmentTypeToInstanceType('ffs')).toBe('certified_ifr_landings_sim');
    expect(foreflightEquipmentTypeToInstanceType('ftd')).toBe('certified_ifr_sim');
  });

  it('is case-insensitive', () => {
    expect(foreflightEquipmentTypeToInstanceType('AATD')).toBe('certified_atd');
  });

  it('defaults "aircraft", blank, and unrecognized values to real', () => {
    expect(foreflightEquipmentTypeToInstanceType('aircraft')).toBe('real');
    expect(foreflightEquipmentTypeToInstanceType('')).toBe('real');
    expect(foreflightEquipmentTypeToInstanceType('some_future_code')).toBe('real');
  });
});
