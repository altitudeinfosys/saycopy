/* eslint-disable @typescript-eslint/no-require-imports */
const configureApp = require('../../../app.config');
const staticConfig = require('../../../app.json').expo;
const reportingVariables = ['EAS_BUILD', 'EAS_BUILD_PROFILE', 'EXPO_PUBLIC_SENTRY_DSN', 'SENTRY_ORG',
  'SENTRY_PROJECT', 'SENTRY_AUTH_TOKEN'] as const;
let savedEnvironment: Record<string, string | undefined>;

beforeEach(() => {
  savedEnvironment = Object.fromEntries(reportingVariables.map((name) => [name, process.env[name]]));
  reportingVariables.forEach((name) => delete process.env[name]);
});
afterEach(() => {
  for (const name of reportingVariables) {
    if (savedEnvironment[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnvironment[name];
  }
});
it('refuses a preview without complete Sentry reporting and source-map credentials', () => {
  process.env.EAS_BUILD_PROFILE = 'preview';
  process.env.EAS_BUILD = 'true';
  expect(() => configureApp({ config: staticConfig })).toThrow('EAS builds require');
});
it('configures source-map upload without exposing the authentication token in app config', () => {
  process.env.EAS_BUILD_PROFILE = 'preview';
  process.env.EAS_BUILD = 'true';
  process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://public@example.ingest.sentry.io/1';
  process.env.SENTRY_ORG = 'example-org';
  process.env.SENTRY_PROJECT = 'saycopy';
  process.env.SENTRY_AUTH_TOKEN = 'PRIVATE_UPLOAD_TOKEN';
  const result = configureApp({ config: staticConfig });
  expect(result.plugins).toContainEqual(['@sentry/react-native/expo', {
    organization: 'example-org', project: 'saycopy', url: 'https://sentry.io/',
  }]);
  expect(JSON.stringify(result)).not.toContain('PRIVATE_UPLOAD_TOKEN');
  expect(result.ios.bundleIdentifier).toBe(staticConfig.ios.bundleIdentifier);
});
it('allows local EAS config resolution before worker-only secrets are loaded', () => {
  process.env.EAS_BUILD_PROFILE = 'preview';
  expect(() => configureApp({ config: staticConfig })).not.toThrow();
});
