module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  testMatch: ['**/*.test.ts?(x)'],
  testPathIgnorePatterns: ['<rootDir>/.worktrees/'],
};
