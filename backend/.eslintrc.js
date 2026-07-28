module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js', 'dist/**'],
  rules: {
    // Allow any — the codebase uses Prisma dynamic queries and NestJS decorators extensively
    '@typescript-eslint/no-explicit-any': 'off',
    // Allow unused vars with underscore prefix (NestJS handlers often have unused req/res)
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    // NestJS decorators handle return types implicitly
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    // Allow require() in config files and dynamic imports
    '@typescript-eslint/no-require-imports': 'off',
  },
};
