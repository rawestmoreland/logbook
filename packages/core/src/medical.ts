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
