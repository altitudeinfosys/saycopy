const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: ['coverage/**', 'dist/**', 'node_modules/**', 'web-build/**'],
  },
];
