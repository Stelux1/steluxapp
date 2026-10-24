export type Module = 'general' | 'materials' | 'welding' | 'tools' | 'settings';
export type FieldType = 'text' | 'number' | 'date' | 'email' | 'textarea' | 'checkbox' | 'select' | 'ref' | 'password';
export type Value = string | number | boolean | null;
export type RecordData = Record<string, Value>;
export interface Row extends RecordData { id: string; _version: number; _archived: boolean; _createdAt: string; _updatedAt: string; }
export interface Field {
  name: string; label: string; type: FieldType; required?: boolean; ref?: string;
  options?: string[]; min?: number; max?: number; step?:number; default?: Value; section?: string;
  hint?: string; hidden?: boolean; readonly?: boolean; showIf?: [string, Value];
  creatable?:boolean;refCategory?:string;
}
export interface Resource {
  key: string; title: string; singular: string; module: Module; group: string;
  description: string; fields: Field[]; columns: string[]; display: string;
  unique?: string[][]; readonly?: boolean; source?: string; actions?: string[]; createAction?: string;
}
export type PermissionVerb='show'|'insert'|'edit'|'delete'|'export'|'import'|'print';
export type PermissionRules=Record<string,PermissionVerb[]>;
export interface User { id: string; name: string; email: string; profileId: string; permissions: Record<Module, number>; capabilities?:PermissionRules; }
export interface AuditEvent { id: string; entityType: string; entityId: string; action: string; summary: string; actorId: string; actorName: string; createdAt: string; }
export interface Bootstrap { user: User; rows: Record<string, Row[]>; activity: AuditEvent[]; }
export interface ActionField extends Field { multiple?: boolean; }
export interface ActionDefinition { key: string; title: string; description: string; module: Module; fields: ActionField[]; submit: string; }
export const labelOf = (row: Row | undefined, resource: Resource) => row ? String(row[resource.display] || row.name || row.id) : '—';
