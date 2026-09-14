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
