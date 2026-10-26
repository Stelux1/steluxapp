// This compiled entry fixes the client-facing scope independently of dashboard
// build settings. Secrets are supplied at runtime, never compiled into assets.
import { HOSTED_RELEASE_PROFILE } from '../shared/release.ts';
process.env.STELUX_RELEASE_PROFILE = HOSTED_RELEASE_PROFILE;
process.env.STELUX_RUNTIME = 'cloud';
process.env.NODE_ENV = 'production';
await import('./index.ts');
export {};
