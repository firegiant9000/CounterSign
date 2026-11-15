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

// Empty at schema 1: there is nothing older to lift.
export const MIGRATIONS: readonly Migration[] = [];
