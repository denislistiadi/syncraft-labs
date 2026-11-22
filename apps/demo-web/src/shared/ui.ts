export interface ColumnTheme {
  readonly accent: string;
  readonly soft: string;
}

const COLUMN_THEMES: Record<string, ColumnTheme> = {
  backlog: { accent: "#64748b", soft: "#eef1f5" },
  "in-progress": { accent: "#2563eb", soft: "#e8effd" },
  review: { accent: "#b45309", soft: "#fbf0df" },
  done: { accent: "#15803d", soft: "#e7f4ea" },
};

const FALLBACK_THEME: ColumnTheme = { accent: "#4757d8", soft: "#e7e9fb" };

export function columnTheme(columnId: string): ColumnTheme {
  return COLUMN_THEMES[columnId] ?? FALLBACK_THEME;
}

export function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}
