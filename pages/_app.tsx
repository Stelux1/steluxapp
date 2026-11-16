import type { AppProps } from 'next/app';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import '@fontsource/outfit/700.css';
import '../client/styles.css';
import '../client/readability.css';
import '../client/usability.css';
import '../client/brand.css';
import '../client/data-lisl.css';
import '../client/project-workspace.css';
import '../client/iso-header.css';
import '../client/pilots.css';
import '../client/nav-collapse.css';
import '../client/signatures.css';
// Pilot flows (keep in step with client/main.tsx: Next.js accepts global CSS only here).
import '../client/hydrotest.css';
import '../client/flanges.css';
import '../client/itp-dashboard.css';
import '../client/weld-catalogs.css';
import '../client/wps.css';
import '../client/welder-data.css';
import '../client/weld-entry.css';
import '../client/releases.css';
import '../client/punch.css';
import '../client/mto-materials.css';
import '../client/mto-procurement.css';
import '../client/mto-stock.css';
import '../client/inspections.css';
import '../client/mto-logistics.css';
import '../client/mto-dashboard.css';
import '../client/pdf-documents.css';
import '../client/iso-book.css';
import '../client/certifications.css';
import '../client/ndt-batch-import.css';

export default function WorkspaceApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps}/>;
}
