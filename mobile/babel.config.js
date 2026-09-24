module.exports = function (api) {
  const apiUrl = process.env.NVET_API_URL || 'http://localhost:3000/api';
  const sentryDsn = process.env.SENTRY_DSN_MOBILE || '';

  // Metro/Babel caches configuration. Tie that cache to runtime inputs so a
  // staging/production rebuild cannot reuse a bundle compiled for another
  // backend or Sentry project.
  api.cache.using(() => `${apiUrl}|${sentryDsn}`);

  const inlineNvetRuntimeConfig = ({types}) => ({
    name: 'inline-nvet-runtime-config',
    visitor: {
      StringLiteral(path) {
        if (path.node.value === '__NVET_API_URL__') {
          path.replaceWith(types.stringLiteral(apiUrl));
        }
        if (path.node.value === '__SENTRY_DSN_MOBILE__') {
          path.replaceWith(types.stringLiteral(sentryDsn));
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
    ],
  };
};
