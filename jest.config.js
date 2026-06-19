module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    '**/*.js',
    '!**/node_modules/**',
    '!**/coverage/**',
    '!jest.config.js',
    '!jest.config.browser.js',
    '!jest.setup.js',
    '!jest.setup.browser.js',
    '!**/*.test.js',
    '!**/*.spec.js',
    '!docs/**'
  ],
  testMatch: [
    '**/__tests__/**/*.js',
    '**/?(*.)+(spec|test).js'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/docs/',
    '/e2e/'
  ],
  verbose: true,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js']
};
