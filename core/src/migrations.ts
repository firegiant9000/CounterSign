export interface RawExport {
  schemaVersion: number;
  data: Record<string, unknown[]>;
  settings: Record<string, unknown>;
}

// A migration lifts a file from schema `to - 1` to schema `to`. Forward only.
export interface Migration {
  to: number;
  migrate(file: RawExport): RawExport;
}

// Schema 1 -> 2 adds six stores; missing stores already read as empty.
export const MIGRATIONS: readonly Migration[] = [
  { to: 2, migrate: (file) => ({ ...file, schemaVersion: 2 }) },
];
