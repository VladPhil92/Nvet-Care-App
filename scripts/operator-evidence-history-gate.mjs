import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  loadOperatorEvidenceControl,
  loadOperatorEvidenceRecords,
} from './lib/operator-evidence.mjs'

const root = process.cwd()
const failures = []

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function git(args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function isSha(value) {
  return /^[0-9a-f]{40}$/i.test(value ?? '')
}

function commitExists(sha) {
  if (!isSha(sha)) return false
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], {
      cwd: root,
      stdio: 'ignore',
    })
    return true
  } catch {
    return false
  }
}

function requireText(relativePath, pattern, purpose) {
  try {
    const content = read(relativePath)
    if (!pattern.test(content)) failures.push(`${purpose}: ${relativePath} does not satisfy ${pattern}`)
  } catch {
    failures.push(`${purpose}: missing ${relativePath}`)
  }
}

let control
try {
  control = await loadOperatorEvidenceControl()
  await loadOperatorEvidenceRecords(control)
} catch (error) {
  failures.push(`Current operator evidence ledger is invalid: ${error?.message ?? error}`)
}

if (control) {
  const recordsDirectory = control.recordsDirectory.replaceAll('\\', '/')
  const eventName = process.env.GITHUB_EVENT_NAME || 'local'
  let baseSha = (process.env.OPERATOR_EVIDENCE_BASE_SHA || '').trim()
  let headSha = (process.env.OPERATOR_EVIDENCE_HEAD_SHA || '').trim()

  if (!headSha) {
    try {
      headSha = git(['rev-parse', 'HEAD'])
    } catch (error) {
      failures.push(`Unable to resolve HEAD: ${error?.message ?? error}`)
    }
  }

  if (eventName === 'workflow_dispatch' && !baseSha) {
    failures.push('workflow_dispatch requires base_sha so append-only history is checked against an explicit trusted base')
  }

  if (baseSha && !commitExists(baseSha)) {
    failures.push(`Operator evidence base SHA is not a reachable commit: ${baseSha}`)
  }
  if (headSha && !commitExists(headSha)) {
    failures.push(`Operator evidence head SHA is not a reachable commit: ${headSha}`)
  }

  if (!baseSha && eventName !== 'workflow_dispatch' && headSha && commitExists(headSha)) {
    try {
      const parent = git(['rev-parse', `${headSha}^1`])
      if (commitExists(parent)) baseSha = parent
    } catch {
      // A repository root commit has no historical records to protect.
    }
  }

  if (baseSha && headSha && commitExists(baseSha) && commitExists(headSha)) {
    let diff = ''
    try {
      diff = git(['diff', '--name-status', baseSha, headSha, '--', recordsDirectory])
    } catch (error) {
      failures.push(`Unable to compare operator evidence history: ${error?.message ?? error}`)
    }

    for (const line of diff.split('\n').filter(Boolean)) {
      const [status, ...paths] = line.split('\t')
      if (status !== 'A') {
        failures.push(
          `Append-only violation (${status}) in ${paths.join(' -> ')}. Existing operator evidence records may never be modified, renamed, copied, or deleted.`,
        )
      }
    }
  }
}

// Self-certification must be explicit. A workflow-generated evidence PR may not
// rely on the implicit pull_request event fired by GITHUB_TOKEN.
requireText(
  '.github/workflows/ci.yml',
  /workflow_dispatch:[\s\S]{0,500}base_sha:/,
  'CI must expose an explicit workflow_dispatch base_sha input',
)
requireText(
  '.github/workflows/operator-evidence-control.yml',
  /actions:\s*write/,
  'Evidence mutation job must have Actions write permission for explicit CI dispatch',
)
requireText(
  '.github/workflows/operator-evidence-control.yml',
  /gh workflow run ci\.yml --ref "\$BRANCH" -f base_sha="\$BASE_SHA"/,
  'Evidence mutation must dispatch CI against its exact evidence branch and trusted base',
)
requireText(
  '.github/workflows/operator-evidence-control.yml',
  /gh run watch "\$run_id" --exit-status/,
  'Evidence mutation must fail closed until the dispatched CI run succeeds',
)

try {
  const workflow = read('.github/workflows/operator-evidence-control.yml')
  const certifyIndex = workflow.indexOf('- name: Self-certify evidence branch with CI')
  const pullRequestIndex = workflow.indexOf('- name: Open evidence pull request')
  if (certifyIndex < 0 || pullRequestIndex < 0 || certifyIndex > pullRequestIndex) {
    failures.push('Evidence PR must be opened only after explicit branch self-certification succeeds')
  }
} catch {
  // Missing file is already reported by requireText above.
}

if (failures.length > 0) {
  console.error('❌ Operator Evidence History gate failed:')
  for (const failure of failures) console.error(` - ${failure}`)
  process.exit(1)
}

console.log('✅ Operator Evidence History gate passed')
console.log('   - current ledger contract: valid')
console.log('   - historical records: append-only')
console.log('   - workflow_dispatch: explicit trusted base')
console.log('   - evidence branches: self-certified before PR creation')
