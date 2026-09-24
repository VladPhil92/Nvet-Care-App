const rnPreset = require('@react-native/jest-preset');

module.exports = {
  ...rnPreset,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testPathIgnorePatterns: [
    ...(rnPreset.testPathIgnorePatterns || []),
    '/node_modules/',
    '/e2e/',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|msw|@mswjs)/)',
  ],
  testEnvironmentOptions: {
    ...(rnPreset.testEnvironmentOptions || {}),
    customExportConditions: ['node', 'require', 'default'],
  },
  moduleNameMapper: {
    ...(rnPreset.moduleNameMapper || {}),
    '^msw/node$': '<rootDir>/__mocks__/msw/node.js',
    '^msw$': '<rootDir>/__mocks__/msw.js',
  },
};
