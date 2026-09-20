'use strict'

const babelJest = require('babel-jest')

const createTransformer =
  babelJest.createTransformer ?? babelJest.default?.createTransformer

if (typeof createTransformer !== 'function') {
  throw new Error('babel-jest createTransformer API is unavailable')
}

const babelTransformer = createTransformer({
  plugins: ['@babel/plugin-transform-modules-commonjs'],
})

const IMPORT_META_URL =
  /\bimport[.]meta[.]url\b/g

const patchImportMetaUrl = (sourceText) =>
  sourceText.replace(
    IMPORT_META_URL,
    "require('node:url').pathToFileURL(__filename).href",
  )

module.exports = {
  canInstrument: babelTransformer.canInstrument,

  process(sourceText, sourcePath, transformOptions) {
    return babelTransformer.process(
      patchImportMetaUrl(sourceText),
      sourcePath,
      transformOptions,
    )
  },

  getCacheKey(sourceText, sourcePath, transformOptions) {
    return babelTransformer.getCacheKey(
      patchImportMetaUrl(sourceText),
      sourcePath,
      transformOptions,
    )
  },
}
