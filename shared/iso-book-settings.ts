/**
 * The ISO Book switches of the earlier "ISO Book" tab of Edit project site (capture weld__general__project-sites__edit-zandbak.txt:84-160).
 *
 * Client change list 22.11.2026 (images 8 and 9): the ISO Book is standard. The tab is gone from the main project form and
 * the switches no longer remove any part; the choice is made when the book is printed (ISO Book dialog, a checkbox per
 * part). The switches stay defined as hidden site fields only so the values stored on older sites are kept and a site
 * that stores them still saves (the server answers 404 for an unknown field). Nothing reads them.
 */
export const ISO_BOOK_SECTION = 'ISO Book';
export interface IsoBookSwitch { name: string; label: string; group: 'LISL' | 'Documents'; part?: string }
const lisl = (name: string, label: string, part?: string): IsoBookSwitch => ({ name, label, group: 'LISL', part });
const doc = (name: string, label: string, part?: string): IsoBookSwitch => ({ name, label, group: 'Documents', part });
export const ISO_BOOK_SWITCHES: IsoBookSwitch[] = [
  lisl('isoBookLislOld', 'LISL', 'lisl:lisl'),
  lisl('isoBookLislOldSignature', 'LISL V2'),
  lisl('isoBookLislA3', 'LISL A3', 'lisl:lisl-a3'),
  // "Weld record" of the reference is the ISO Book part Weld Label now (one QR label per weld, server/pdf/iso-book-weld-labels.ts).
  lisl('isoBookLislOldV2', 'Weld Label', 'weld-labels'),
  lisl('isoBookLislNew', 'LISL [GU]', 'lisl:lisl-gu'),
  lisl('isoBookLislMv', 'LISL [MV]', 'lisl:lisl-mv'),
  lisl('isoBookLislWq', 'LISL [WQ]', 'lisl:lisl-wq'),
  lisl('isoBookLislGuVer2', 'LISL [GU Rev 2]', 'lisl:lisl-gu-rev2'),
  lisl('isoBookLislBlank', 'Blank LISL', 'lisl-blank'),
  lisl('isoBookLislIss', 'LISL [ISS]', 'lisl:lisl-iss'),
  lisl('isoBookLislGuVer3', 'LISL [GU Rev 3]', 'lisl:lisl-gu-rev3'),
  lisl('isoBookLislWqNew', 'LISL [WQ ver 2]', 'lisl:lisl-wq2'),
  doc('isoBookTask', 'Task sheet', 'task-sheet'),
  doc('isoBookItp', 'ITP documents', 'itp'),
  doc('isoBookItp2', 'ITP 2 documents', 'itp2'),
  doc('isoBookIsometric', 'Isometric', 'isometric'),
  doc('isoBookNdtPre', 'NDT Pre', 'ndt-pre'),
  doc('isoBookNdt', 'NDT', 'ndt'),
  doc('isoBookPwht', 'Pre-HT/PWHT', 'pwht'),
  doc('isoBookPicklist', 'Pick Lists', 'pick-lists'),
  doc('isoBookPqr', 'PQR', 'pqr'),
  doc('isoBookWps', 'WPS', 'wps'),
  doc('isoBookWpsGroup', 'WPS (Group)'),
  doc('isoBookSummary', "Welder's summary lists", 'welders-summary'),
  doc('isoBookWelderCerts', "Welders' certifications"),
  doc('isoBookVt', 'Visual reports', 'visual-reports'),
  doc('isoBookWires', 'Welding wires'),
  doc('isoBookCertificateIndex', 'Certificate Index', 'certificate-index'),
  doc('isoBookCertificates', 'Material certificates', 'material-certificates'),
  doc('isoBookCertificatesGroup', 'Material certificates (Group)'),
  doc('isoBookReleaseShop', 'Prefab release document', 'prefab-release'),
  doc('isoBookReleaseField', 'Field release document', 'field-release'),
  doc('isoBookPunchlistBlank', 'Punch list (blank)', 'punch-list-blank'),
  doc('isoBookPunchlist', 'Punch list', 'punch-list'),
  doc('isoBookNdtProcess', 'NDT Process documents', 'ndt-process-docs'),
  doc('isoBookFlangeReport', 'Flange report', 'flange-report'),
  doc('isoBookFlangeLabels', 'Flange labels'),
];
export const ISO_BOOK_SWITCH_NAMES = ISO_BOOK_SWITCHES.map(item => item.name);
/** A stored switch of a site record, as the earlier tab read it (never saved = on). Kept for data checks; no part depends on it. */
export const isoBookSwitchOn = (site: Record<string, unknown> | undefined | null, name: string) => site?.[name] !== false;
