export type DatabaseValue = string | number | bigint | null | Uint8Array;
export interface Statement {
  all(...values: DatabaseValue[]): Record<string, unknown>[];
  get(...values: DatabaseValue[]): Record<string, unknown> | undefined;
  run(...values: DatabaseValue[]): unknown;
}
export interface Database {
  readonly dialect?: 'postgres';
  exec(sql: string): void;
  prepare(sql: string): Statement;
  close(): void;
}

// Convert only placeholders outside SQL strings/comments/quoted identifiers.
export function postgresParameters(sql: string): string {
  let parameter = 0;
  return sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|\?/g,
    token => token === '?' ? `$${++parameter}` : token);
}
