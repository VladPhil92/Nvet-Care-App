module.exports = function (api) {
  const apiUrl = process.env.NVET_API_URL || 'http://localhost:3000/api';

  // Metro/Babel caches configuration. Tie that cache to the API URL so a
  // staging/production rebuild cannot reuse a bundle compiled for another
  // environment.
  api.cache.using(() => apiUrl);

  const inlineNvetRuntimeConfig = ({types}) => ({
    name: 'inline-nvet-runtime-config',
    visitor: {
      StringLiteral(path) {
        if (path.node.value === '__NVET_API_URL__') {
          path.replaceWith(types.stringLiteral(apiUrl));
        }
      },
    },
  });

  return {
    presets: ['module:@react-native/babel-preset'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./src'],
          extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json'],
          alias: {
            '@': './src',
          },
        },
      ],
      inlineNvetRuntimeConfig,
      'react-native-reanimated/plugin', // MUST be last
    ],
  };
};
