/**
 * Display helpers. The app is shown in Brazilian Portuguese, while data keys (such as the
 * English weekday names the API and the spreadsheet use) stay as they are.
 */
export const LOCALE = "pt-BR";

const DAY_LABELS: Record<string, string> = {
  Monday: "Segunda-feira",
  Tuesday: "Terça-feira",
  Wednesday: "Quarta-feira",
  Thursday: "Quinta-feira",
  Friday: "Sexta-feira",
  Saturday: "Sábado",
  Sunday: "Domingo",
};

/** "Monday" -> "Segunda-feira". */
export function dayLabel(day: string): string {
  return DAY_LABELS[day] ?? day;
}

/** plural(1, "exercício", "exercícios") -> "1 exercício"; plural(3, ...) -> "3 exercícios". */
export function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** Whole number with Brazilian digit grouping: 12345.6 -> "12.346". */
export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString(LOCALE);
}

export function formatDate(iso: string, options?: Intl.DateTimeFormatOptions): string {
  return new Date(iso).toLocaleDateString(LOCALE, options);
}
