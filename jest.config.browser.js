module.exports = {
  testEnvironment: 'jsdom',
  coverageDirectory: 'coverage/browser',
  collectCoverageFrom: [
    'docs/Mapper.js'
  ],
  testMatch: [
    '**/docs/**/*.test.js'
  ],
  moduleFileExtensions: ['js', 'json'],
  verbose: true,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.browser.js'],
  testEnvironment: 'jsdom',
  transform: {}
};