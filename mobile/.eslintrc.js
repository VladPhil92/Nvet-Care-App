module.exports = {
  root: true,
  extends: '@react-native',
  ignorePatterns: ['coverage/', '.detox-artifacts/', 'node_modules/'],
  rules: {
    'react/react-in-jsx-scope': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    'react-hooks/exhaustive-deps': 'warn',
    'semi': 'off',
    'curly': 'off',
    'react-native/no-inline-styles': 'off',
    'react/no-unstable-nested-components': 'off',
    'no-bitwise': 'off',
    'no-trailing-spaces': 'off',
    'eslint-comments/no-unused-disable': 'off',
    '@typescript-eslint/no-shadow': 'off',
  },
};
