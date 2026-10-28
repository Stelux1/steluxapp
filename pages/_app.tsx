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

export default function WorkspaceApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps}/>;
}
