module.exports = ({ config }) => {
  // EAS secret variables are available on the worker, not during local config resolution.
  const isBuild = process.env.EAS_BUILD === 'true';
  const required = ['EXPO_PUBLIC_SENTRY_DSN', 'SENTRY_ORG', 'SENTRY_PROJECT', 'SENTRY_AUTH_TOKEN'];
  if (isBuild && required.some((name) => !process.env[name])) {
    throw new Error('EAS builds require SayCopy Sentry reporting and source-map configuration.');
  }
  return {
    ...config,
    plugins: [
      ...config.plugins.filter((plugin) => plugin !== '@sentry/react-native'),
      ['@sentry/react-native/expo', {
        organization: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        url: 'https://sentry.io/',
      }],
    ],
  };
};
