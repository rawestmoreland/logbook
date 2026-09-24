import { createServerFn } from '@tanstack/react-start'

import {
  extractForeFlightAircraftTable,
  findAircraftModelAlias,
  findConfidentModelMatch,
  isForeFlightCsv,
  parseAircraftCsv,
} from '@logbook/core'

import { loadModelMatchCandidates, lookupAircraftByTails, matchesResolvedModel } from '#/lib/server/import'
import { describeModel } from '#/lib/server/models'
import { createRequestPocketBase } from '#/lib/server/pocketbase'

import type { AircraftCsvParseResult, AircraftResponse, PilotAircraftResponse } from '@logbook/core'
import type { AutoResolvedTail, ModelMismatchWarning, UnresolvedTail } from '#/lib/server/import'

/**
 * Aircraft-only CSV import for the `/aircraft` page (closes issue #21) — a
 * scaled-down sibling of `import.ts`'s flight importer that skips flight
 * data entirely: parse a bare aircraft list, classify each tail the same
 * way `previewImport` does (reusing `findConfidentModelMatch`/
 * `findAircraftModelAlias`/`lookupAircraftByTails`/`loadModelMatchCandidates`
 * from `import.ts`), then hand the classified rows to the *existing*
 * `resolveImportAircraft` server function to create/find aircraft and add
 * them to the pilot's fleet — no separate creation path, no flight rows
 * ever get written.
 *
 * Two source formats are accepted (see CLAUDE.md's import notes):
 *   - A native aircraft-list CSV — `parseAircraftCsv` (Tail Number,
 *     Manufacturer, Model, Instance Type; see `csv-aircraft.ts` for the
 *     full accepted-header list).
 *   - A ForeFlight export (full logbook or just the Aircraft Table on its
 *     own) — `extractForeFlightAircraftTable` reads only the Aircraft
 *     Table section and ignores any Flights Table entirely, so a pilot can
 *     upload their whole ForeFlight export here just to seed their fleet.
 */

export type AircraftImportRowPreview = {
  row: number
  tailNumber: string
  tailKey: string
}

export type PreviewAircraftImportResult = {
  rows: Array<AircraftImportRowPreview>
  rowErrors: Array<{ row: number; message: string }>
  unresolvedTails: Array<UnresolvedTail>
  autoResolvedTails: Array<AutoResolvedTail>
  modelMismatchWarnings: Array<ModelMismatchWarning>
}

function tailKeyFor(tailNumber: string): string {
  return `tail:${tailNumber}`
}

function parseAircraftImportCsv(csvText: string): AircraftCsvParseResult {
  return isForeFlightCsv(csvText) ? extractForeFlightAircraftTable(csvText) : parseAircraftCsv(csvText)
}

/**
 * Parses the CSV and classifies every distinct tail (see the module doc
 * comment) without writing anything — the aircraft-only counterpart to
 * `previewImport`. A tail already in the pilot's fleet is left alone
 * entirely; one not yet in the fleet either resolves automatically (its CSV
 * model text confidently matches an existing catalog model) or is surfaced
 * for the pilot to point at a model via `ModelPicker`, same as the flight
 * importer.
 */
export const previewAircraftImport = createServerFn({ method: 'POST' })
  .validator((data: { pilotId: string; csvText: string }) => data)
  .handler(async ({ data }): Promise<PreviewAircraftImportResult> => {
    const pb = createRequestPocketBase()

    const { rows: parsedRows, errors: rowErrors } = parseAircraftImportCsv(data.csvText)

    const fleetJoins = await pb
      .collection('pilot_aircraft')
      .getFullList<PilotAircraftResponse<{ aircraft: AircraftResponse }>>({
        filter: pb.filter('pilot = {:pilotId} && deleted != true', { pilotId: data.pilotId }),
        expand: 'aircraft',
      })
    const fleetTails = new Set(fleetJoins.map((j) => j.expand.aircraft.tail_number.toUpperCase()))

    const distinctTails = new Set(parsedRows.map((r) => r.tailNumber))
    const aircraftByTail = await lookupAircraftByTails(pb, distinctTails)
    const modelMatchCandidates = await loadModelMatchCandidates(pb)

    const unresolvedByKey = new Map<string, UnresolvedTail>()
    const autoResolvedByKey = new Map<string, AutoResolvedTail>()
    const modelMismatchWarnings: Array<ModelMismatchWarning> = []
    const rowPreviews: Array<AircraftImportRowPreview> = []

    for (const r of parsedRows) {
      const tailKey = tailKeyFor(r.tailNumber)
      const aircraft = aircraftByTail.get(r.tailNumber)

      if (aircraft) {
        if (!fleetTails.has(r.tailNumber)) {
          const model = aircraft.expand.model
          const manufacturer = model.expand.manufacturer
          if (!matchesResolvedModel(r.modelText, manufacturer.name, model)) {
            modelMismatchWarnings.push({
              tailNumber: r.tailNumber,
              csvModel: r.modelText,
              actualModel: describeModel(manufacturer.name, model.model, model.common_name),
            })
          }
        }
      } else if (!unresolvedByKey.has(tailKey) && !autoResolvedByKey.has(tailKey)) {
        const match = findConfidentModelMatch(r.modelText, modelMatchCandidates)
        if (match) {
          autoResolvedByKey.set(tailKey, {
            tailKey,
            tailNumber: r.tailNumber,
            csvModel: r.modelText,
            isAnonymous: false,
            modelId: match.id,
            modelDescription: describeModel(match.manufacturerName, match.model, match.commonName),
            suggestedInstanceType: r.instanceType,
          })
        } else {
          unresolvedByKey.set(tailKey, {
            tailKey,
            tailNumber: r.tailNumber,
            csvModel: r.modelText,
            isAnonymous: false,
            suggestedInstanceType: r.instanceType,
            suggestedModel: findAircraftModelAlias(r.modelText) ?? undefined,
          })
        }
      }

      rowPreviews.push({ row: r.row, tailNumber: r.tailNumber, tailKey })
    }

    return {
      rows: rowPreviews,
      rowErrors,
      unresolvedTails: [...unresolvedByKey.values()],
      autoResolvedTails: [...autoResolvedByKey.values()],
      modelMismatchWarnings,
    }
  })
