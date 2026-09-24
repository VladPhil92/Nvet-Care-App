const path = require('path');

const reactNativeDir = path.dirname(
  require.resolve('react-native', { paths: [__dirname] }),
);
const reactNativePresetDir = path.dirname(
  require.resolve('@react-native/jest-preset', { paths: [__dirname] }),
);

module.exports = {
  haste: {
    defaultPlatform: 'ios',
    platforms: ['android', 'ios', 'native'],
  },
  resolver: path.join(reactNativePresetDir, 'jest', 'resolver.js'),
  transform: {
    '^.+\\.(js|ts|tsx)$': 'babel-jest',
    '^.+\\.(bmp|gif|jpg|jpeg|mp4|png|psd|svg|webp)$':
      '<rootDir>/jest.assetFileTransformer.cjs',
  },
  setupFiles: [path.join(reactNativePresetDir, 'jest', 'setup.js')],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironment: path.join(
    reactNativePresetDir,
    'jest',
    'react-native-env.js',
  ),
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|msw|@mswjs)/)',
  ],
  testEnvironmentOptions: {
    customExportConditions: ['node', 'require', 'default'],
  },
  moduleNameMapper: {
    '^react-native/setup-env$': `${reactNativeDir}/src/setup-env.js`,
    '^react-native($|/.*)': `${reactNativeDir}/$1`,
    '^msw/node$': '<rootDir>/__mocks__/msw/node.js',
    '^msw$': '<rootDir>/__mocks__/msw.js',
  },
};
