import dynamic from 'next/dynamic';
import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { availabilityFor, pageAvailable, HOSTED_RELEASE_PROFILE } from '../shared/release.ts';
import { RESOURCES } from '../shared/resources.ts';

const Workspace = dynamic(() => import('../client/App.tsx'), {
  ssr: false,
  loading: () => <div className="auth-page" role="status">Loading workspace…</div>,
});

export default function WorkspacePage() {
  return <>
    <Head>
      <title>Blitzkrieg — Welding workspace</title>
      <meta name="description" content="Blitzkrieg connects projects, isometrics, welds, and inspection records in one welding workspace."/>
      <meta name="theme-color" content="#061b42"/>
      <meta name="viewport" content="width=device-width, initial-scale=1"/>
      <link rel="icon" type="image/svg+xml" href="/brand/favicon.svg"/>
    </Head>
    <Workspace/>
  </>;
}

export const getServerSideProps: GetServerSideProps = async ({ resolvedUrl, res, query }) => {
  const availability = availabilityFor(HOSTED_RELEASE_PROFILE);
  const path = new URL(resolvedUrl, 'http://localhost').pathname;
  res.setHeader('Cache-Control', 'private, no-store');
  if (!pageAvailable(availability, path, RESOURCES) ||
    (path === '/welding/reports' && query.report && !Object.hasOwn(availability!.reports, String(query.report)))) {
    return { notFound: true };
  }
  return { props: {} };
};
