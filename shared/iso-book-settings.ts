/**
 * "ISO Book" tab of Edit project site (capture weld__general__project-sites__edit-zandbak.txt:84-160): 12 LISL variants,
 * then 25 document types, each a switch of the main project. The Add dialog has no such tab; a new site has every switch
 * on (as Zandbak; the value for a new site is not captured), and a site saved before the tab existed reads every switch as
 * on (`isoBookSwitchOn`), so no stored row needs a value.
 *
 * Effect (our default, the capture shows only the switches and the LISL help line): the ISO Book of an isometric of that
 * main project offers only the parts switched on. A switch without a part in our ISO Book (`part` undefined) is kept
 * with the site and copied by Duplicate, but has nothing to switch off yet.
 */
export const ISO_BOOK_SECTION = 'ISO Book';
export const ISO_BOOK_LISL_HELP = 'These variants are grouped together. Turn on the LISL that this site uses in the ISO Book.';
export interface IsoBookSwitch { name: string; label: string; group: 'LISL' | 'Documents'; part?: string }
const lisl = (name: string, label: string, part?: string): IsoBookSwitch => ({ name, label, group: 'LISL', part });
const doc = (name: string, label: string, part?: string): IsoBookSwitch => ({ name, label, group: 'Documents', part });
export const ISO_BOOK_SWITCHES: IsoBookSwitch[] = [
  lisl('isoBookLislOld', 'LISL', 'lisl:lisl'),
  lisl('isoBookLislOldSignature', 'LISL V2'),
  lisl('isoBookLislA3', 'LISL A3', 'lisl:lisl-a3'),
  lisl('isoBookLislOldV2', 'Weld record'),
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
export const ISO_BOOK_OFF_REASON = 'Switched off for this project site (Edit project site → ISO Book).';

/** A switch of a site record; one that was never saved (older sites) is on. */
export const isoBookSwitchOn = (site: Record<string, unknown> | undefined | null, name: string) => site?.[name] !== false;
/** Whether the site switches this ISO Book part off (parts without a switch are never off). */
export function isoBookPartOff(site: Record<string, unknown> | undefined | null, part: string): boolean {
  const item = ISO_BOOK_SWITCHES.find(entry => entry.part === part);
  return Boolean(item) && !isoBookSwitchOn(site, item!.name);
}
