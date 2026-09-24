/**
 * Jest config para Detox E2E.
 * - Runs solo archivos *.test.ts dentro de e2e/
 * - Ejecuta los flujos numerados en orden lexical (01 -> 02 -> 03)
 * - Registra helpers/hooks después de inicializar el entorno Detox
 * - Reporter detox/runners/jest/reporter para output legible
 * - Verbose para CI (cada step visible)
 */

const path = require('path')

/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  rootDir: '..',
  testMatch: ['<rootDir>/e2e/**/*.test.ts'],
  testTimeout: 120_000,
  maxWorkers: 1,
  testSequencer: '<rootDir>/e2e/sequencer.js',
  globalSetup: 'detox/runners/jest/globalSetup',
  globalTeardown: 'detox/runners/jest/globalTeardown',
  reporters: ['detox/runners/jest/reporter'],
  testEnvironment: 'detox/runners/jest/testEnvironment',
  setupFilesAfterEnv: ['<rootDir>/e2e/setup.ts'],
  verbose: true,
  preset: 'ts-jest',
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          // TypeScript 6 (TS5011) requires an explicit rootDir when ts-jest emits.
          rootDir: path.resolve(__dirname, '..'),
          target: 'es2020',
          module: 'commonjs',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          strict: false,
        },
      },
    ],
  },
}
