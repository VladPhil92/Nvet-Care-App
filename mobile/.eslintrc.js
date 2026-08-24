module.exports = {
  root: true,
  extends: '@react-native',
  ignorePatterns: ['coverage/', '.detox-artifacts/', 'node_modules/'],
  rules: {
    'react/react-in-jsx-scope': 'off',
  },
};
