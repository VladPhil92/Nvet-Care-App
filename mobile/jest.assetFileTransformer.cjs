'use strict';

const createCacheKeyFunction =
  require('@jest/create-cache-key-function').default;
const path = require('path');

const reactNativePackage = require.resolve('react-native/package.json', {
  paths: [__dirname],
});
const basePath = path.resolve(reactNativePackage, '../jest/');

module.exports = {
  process: (_, filename) => ({
    code: `module.exports = {
      testUri:
        ${JSON.stringify(path.relative(basePath, filename).replace(/\\/g, '/'))}
    };`,
  }),
  getCacheKey: createCacheKeyFunction([__filename]),
};
