// Shared by flight-form.ts (hoursField/landingsField) and flight-properties.ts
// (decimal/integer property values). Lives in its own module because
// flight-form.ts imports flight-properties.ts for the `properties` form
// field — keeping the patterns in either of those would make them import
// each other.
export const DECIMAL_PATTERN = /^\d*\.?\d*$/;
export const INTEGER_PATTERN = /^\d*$/;
