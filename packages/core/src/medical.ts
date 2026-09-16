/**
 * FAA airman medical certificate classes (14 CFR 61.23), used by
 * `medicalCurrency()`/`medicalDurationMonths()` to compute validity windows.
 */
export const MEDICAL_CLASSES = ['first', 'second', 'third'] as const;

/** Canonical medical class type — `currency/rules.ts`'s `medicalCurrency()` takes this. */
export type MedicalClass = (typeof MEDICAL_CLASSES)[number];

export const MEDICAL_CLASS_LABELS: Record<MedicalClass, string> = {
  first: 'First Class',
  second: 'Second Class',
  third: 'Third Class',
};

export function isMedicalClass(value: string): value is MedicalClass {
  return (MEDICAL_CLASSES as readonly string[]).includes(value);
}

/**
 * The two FAA medical-currency pathways: the traditional first/second/third
 * class certificate ladder (`medicalCurrency()`), or 14 CFR part 68
 * (`basicMedCurrency()`) — a newer, unrelated pathway with its own two
 * currency windows instead of a certificate class. Mutually exclusive: a
 * pilot flies under one or the other, never both at once.
 */
export const MEDICAL_PATHWAYS = ['certificate', 'basicmed'] as const;

export type MedicalPathway = (typeof MEDICAL_PATHWAYS)[number];

export const MEDICAL_PATHWAY_LABELS: Record<MedicalPathway, string> = {
  certificate: 'Medical certificate',
  basicmed: 'BasicMed',
};

export function isMedicalPathway(value: string): value is MedicalPathway {
  return (MEDICAL_PATHWAYS as readonly string[]).includes(value);
}

/**
 * EASA Part-MED medical certificate classes covered so far: the LAPL
 * medical and Class 2 (both GA/private privileges), used by
 * `currency/rules.ts`'s `easaMedicalCurrency()`/`easaMedicalDurationMonths()`.
 * Class 1 (commercial) is out of scope — see the doc comment above
 * `easaMedicalDurationMonths` in rules.ts.
 */
export const EASA_MEDICAL_CLASSES = ['lapl', 'class2'] as const;

export type EasaMedicalClass = (typeof EASA_MEDICAL_CLASSES)[number];

export const EASA_MEDICAL_CLASS_LABELS: Record<EasaMedicalClass, string> = {
  lapl: 'LAPL medical',
  class2: 'Class 2',
};

export function isEasaMedicalClass(value: string): value is EasaMedicalClass {
  return (EASA_MEDICAL_CLASSES as readonly string[]).includes(value);
}

/**
 * Which jurisdiction's currency rules apply to a pilot, backed by the
 * `regulatory_profiles` collection (`pilots.regulatory_profile`). This is
 * not a JSON-driven rules engine — the `rules` json on that collection is
 * just a `{ code }` lookup key; the actual currency logic for each
 * jurisdiction is the typed functions in `currency/rules.ts`
 * (`medicalCurrency`/`basicMedCurrency` for `'faa'`, `easaMedicalCurrency`
 * for `'easa'`).
 */
export const JURISDICTIONS = ['faa', 'easa'] as const;

export type Jurisdiction = (typeof JURISDICTIONS)[number];

export const JURISDICTION_LABELS: Record<Jurisdiction, string> = {
  faa: 'FAA (United States)',
  easa: 'EASA (Europe)',
};

export function isJurisdiction(value: string): value is Jurisdiction {
  return (JURISDICTIONS as readonly string[]).includes(value);
}
