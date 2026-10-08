const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: ['coverage/**', 'dist/**', 'node_modules/**', 'web-build/**'],
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['**/*.test.ts', '**/*.test.tsx', 'src/test/**', 'src/observability/**'],
    rules: {
      'no-restricted-syntax': ['error', {
        selector: "CatchClause:not(:has(CallExpression[callee.name='reportError'])):not(:has(ThrowStatement))",
        message: 'Handled errors must call the privacy-safe Sentry reporter; only rethrown errors may delegate reporting.',
      }, {
        selector: "CallExpression[callee.property.name='catch'] > ArrowFunctionExpression:not(:has(CallExpression[callee.name='reportError'])):not(:has(ThrowStatement))",
        message: 'Promise catch handlers must report errors to Sentry or rethrow them.',
      }],
    },
  },
];
