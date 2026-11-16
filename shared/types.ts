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
  /** A select without an empty option (the profile of a ticked application: one profile is always chosen). */
  noBlank?: boolean;
  /** Text of a select's empty option (default "Select <label>"). */
  blank?: string;
  /** Options of a reference to welders read "<ID nr.> <Name>" (the reference's Welder 1 / Welder 2 lists). */
  refDisplay?: 'numberName';
  /** Earlier CSV column headings (labels) that still import into this field. */
  aliases?: string[];
  /** Earlier stored values mapped to the option they now stand for (see shared/priority.ts). Never rewritten in bulk. */
  legacy?: Record<string, string>;
  /** The list column's heading where it differs from the form label. */
  columnLabel?: string;
  /** Number typed as text: a decimal comma or point is accepted (the hosted diameter catalog); the server stores a number. */
  decimal?: boolean;
  /** Select that also accepts a typed value that is not in its list (hosted material types). */
  free?: boolean;
  /** Short help line shown above the field. */
  intro?: string;
  /** Filled by the server when left empty: not offered in the add / edit form (hosted welding wire index number). */
  generated?: boolean;
  /** A select shown as radio buttons (no empty option), each option with its short explanation from `optionHints`. */
  control?: 'radio';
  optionHints?: Record<string, string>;
}
export interface Resource {
  key: string; title: string; singular: string; module: Module; group: string;
  description: string; fields: Field[]; columns: string[]; display: string;
  unique?: string[][]; readonly?: boolean; source?: string; actions?: string[]; createAction?: string;
  /** Headings of the Add / Edit / Delete dialogs and the add button where the hosted profile words them its own way. */
  wording?: { add: string; edit: string; remove: string; /** Label of the Edit dialog's cancel button where the reference does not say Cancel (Welders: Close). */ cancelEdit?: string };
  /** List headers that differ from the field labels (the form keeps the field label). */
  columnLabels?: Record<string, string>;
}
export type PermissionVerb='show'|'insert'|'edit'|'delete'|'export'|'import'|'print';
export type PermissionRules=Record<string,PermissionVerb[]>;
/** Positive capabilities of the delivered workspace, independent of account permissions. */
export interface Availability {
  resources: Record<string, string[]>;
  actions: Record<string, string[]>;
  reports: Record<string, string[]>;
  inspectionTypes: string[];
  navigation: string[];
  features: string[];
}
export interface User {
  id: string; name: string; email: string; profileId: string; permissions: Record<Module, number>; capabilities?:PermissionRules; availability?: Availability;
  /** Where the profile delivers pilots: the pilot these permissions were evaluated for (absent on the selector / account requests). */
  pilot?: 'weld' | 'mto';
  /** Where the profile delivers pilots: the pilots this account may enter. */
  pilots?: ('weld' | 'mto')[];
  /** Where the profile delivers pilots: the account is limited to chosen main projects in the current pilot (shared/site-scope.ts). */
  siteLimited?: boolean;
  /** Where the profile delivers pilots: the main project these permissions were evaluated for (limited accounts, shared/site-scope.ts). */
  siteId?: string;
  /** Where the profile delivers pilots: a limited account with several main projects that has not chosen one yet; it has no rights until it does. */
  siteRequired?: boolean;
}
export interface AuditEvent { id: string; entityType: string; entityId: string; action: string; summary: string; actorId: string; actorName: string; createdAt: string; }
export interface Bootstrap { user: User; rows: Record<string, Row[]>; activity: AuditEvent[];
  /** Pilots profile: the server summary of every visible isometric, by id (aggregates only; see shared/iso-summary.ts). */
  isoSummaries?: Record<string, import('./iso-summary.ts').IsoSummary>;
  /** Pilots profile: Status (%) of every visible project, by id (shared/iso-summary.ts `projectStatuses`). */
  projectStatus?: Record<string, number>;
  /** Pilots profile: which parts Copy isometrics may carry for this account. */
  copyParts?: import('./permissions.ts').CopyParts;
  /** Pilots profile, limited account with several main projects: the main-project choice (each main project read with its own profile). */
  siteRows?: Record<string, Row[]>;
  /** Pilots profile: the main project chosen for the sign-in session ('' while none is), shared by every pilot and tab. */
  sessionSiteId?: string; }
export interface ActionField extends Field { multiple?: boolean; /** Checkbox field that the "ALL" option of this multi-select stands for. */ allField?: string; }
export interface ActionDefinition { key: string; title: string; description: string; module: Module; fields: ActionField[]; submit: string; }
export const labelOf = (row: Row | undefined, resource: Resource) => row ? String(row[resource.display] || row.name || row.id) : '—';
