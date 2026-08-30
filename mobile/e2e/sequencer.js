const Sequencer = require('@jest/test-sequencer').default

/**
 * Detox flows are intentionally numbered because they mutate shared staging
 * fixtures. Jest's default sequencer may reorder files even with maxWorkers=1,
 * so keep execution lexical and explicit: 01 -> 02 -> 03.
 */
class NvetE2ESequencer extends Sequencer {
  sort(tests) {
    return Array.from(tests).sort((a, b) => a.path.localeCompare(b.path))
  }
}

module.exports = NvetE2ESequencer
