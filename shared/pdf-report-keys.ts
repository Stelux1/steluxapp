/**
 * Access keys of the operational PDF documents (`server/pdf/operational-documents.ts`). Each key stands for one
 * printable document family and names the resource whose "export" right decides who may print it (see `canReport`).
 * They are not entries of REPORTS (there is no table or CSV behind them); the hosted profile lists them in
 * `availability.reports` with no columns so `canReport` finds them.
 */
export const PDF_REPORT_RESOURCES: Record<string, string[]> = {
  'pdf-ndt-request': ['inspection_requests'],
  'pdf-visual-report': ['inspection_results', 'visual_reports'],
  'pdf-release': ['releases'],
  'pdf-hydrotest': ['hydrotest_requests'],
  'pdf-punch': ['punchlists'],
  'pdf-flanges': ['flanges'],
  'pdf-picklist': ['picklists'],
  'pdf-welder-card': ['welders'],
  'pdf-reserved-materials': ['reservations'],
  'pdf-order': ['orders'],
  'pdf-material-label': ['stock'],
  // Reports ▾ of the Weld Pilot dashboard (shared/dashboard-reports.ts).
  'pdf-dashboard-reports': ['welds'],
};
