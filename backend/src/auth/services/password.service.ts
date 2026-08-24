import { Injectable, Logger } from '@nestjs/common'

/**
 * PasswordService — wrapper de Argon2id con backwards compatibility.
 *
 * El contrato público conserva alias compatibles (`valid`/`isValid` y
 * `issues`/`reasons`) porque el código histórico del backend usa ambas
 * convenciones. Esto permite sanear el repositorio sin alterar la semántica
 * de autenticación durante la transición.
 */

let argon2Module: any | null = null
function getArgon2() {
  if (!argon2Module) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    argon2Module = require('argon2')
  }
  return argon2Module
}

let bcryptModule: any | null = null
function getBcrypt() {
  if (!bcryptModule) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    bcryptModule = require('bcrypt')
  }
  return bcryptModule
}

const ARGON2_OPTIONS = {
  type: 2,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  hashLength: 32,
}

const COMMON_PASSWORDS = new Set([
  '123456', 'password', '12345678', 'qwerty', '123456789',
  '12345', '1234', '111111', '1234567', 'dragon',
  '123123', 'baseball', 'abc123', 'football', 'monkey',
  'letmein', 'shadow', 'master', '666666', 'qwertyuiop',
  '123321', 'mustang', '1234567890', 'michael', '654321',
  'pussy', 'superman', '1qaz2wsx', '7777777', '121212',
  '000000', 'qazwsx', '123qwe', 'killer', 'trustno1',
  'jordan', 'jennifer', 'zxcvbnm', 'asdfgh', 'hunter',
  'buster', 'soccer', 'harley', 'batman', 'andrew',
  'tigger', 'sunshine', 'iloveyou', '2000', 'charlie',
  'robert', 'thomas', 'hockey', 'ranger', 'daniel',
  'starwars', 'klaster', '112233', 'george', 'asshole',
  'computer', 'michelle', 'jessica', 'pepper', '1111',
  'zxcvbn', '555555', '11111111', '131313', 'freedom',
  '777777', 'pass', 'fuck', 'maggie', '159753',
  'aaaaaa', 'ginger', 'princess', 'joshua', 'cheese',
  'amanda', 'summer', 'love', 'ashley', '6969',
  'nicole', 'chelsea', 'biteme', 'matthew', 'access',
  'yankees', '987654321', 'dallas', 'austin', 'thunder',
  'taylor', 'matrix', 'admin', 'administrator', 'welcome',
])

export interface PasswordVerificationResult {
  valid: boolean
  isValid: boolean
  needsRehash: boolean
}

export interface PasswordStrengthResult {
  valid: boolean
  isValid: boolean
  score: number
  issues: string[]
  reasons: string[]
}

@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name)

  async hash(plaintext: string): Promise<string> {
    if (!plaintext || plaintext.length === 0) {
      throw new Error('Password no puede ser vacío')
    }
    return getArgon2().hash(plaintext, ARGON2_OPTIONS)
  }

  /**
   * Verifica una contraseña. El contrato canónico es `verify(plaintext, hash)`.
   * Durante la consolidación aceptamos también el orden histórico inverso
   * cuando el primer argumento tiene formato inequívoco de hash.
   */
  async verify(
    plaintextOrHash: string,
    hashOrPlaintext: string,
  ): Promise<PasswordVerificationResult> {
    let plaintext = plaintextOrHash
    let hash = hashOrPlaintext

    if (this.isPasswordHash(plaintextOrHash) && !this.isPasswordHash(hashOrPlaintext)) {
      hash = plaintextOrHash
      plaintext = hashOrPlaintext
    }

    if (!hash || !plaintext) {
      return this.verificationResult(false, false)
    }

    if (hash.startsWith('$argon2')) {
      try {
        const valid = await getArgon2().verify(hash, plaintext)
        const needsRehash = valid && this.argon2NeedsRehash(hash)
        return this.verificationResult(valid, needsRehash)
      } catch (err) {
        this.logger.warn(`Argon2 verify failed: ${(err as Error).message}`)
        return this.verificationResult(false, false)
      }
    }

    if (
      hash.startsWith('$2a$') ||
      hash.startsWith('$2b$') ||
      hash.startsWith('$2y$')
    ) {
      try {
        const valid = await getBcrypt().compare(plaintext, hash)
        return this.verificationResult(valid, valid)
      } catch (err) {
        this.logger.warn(`Bcrypt verify failed: ${(err as Error).message}`)
        return this.verificationResult(false, false)
      }
    }

    this.logger.error('Hash format no soportado')
    return this.verificationResult(false, false)
  }

  validateStrength(password: string): PasswordStrengthResult {
    const issues: string[] = []
    let score = 0

    if (!password || password.length < 8) {
      issues.push('Mínimo 8 caracteres')
    } else {
      score += 1
      if (password.length >= 12) score += 1
      if (password.length >= 16) score += 1
    }

    if (COMMON_PASSWORDS.has(password.toLowerCase())) {
      issues.push('Password demasiado común')
      score = Math.max(0, score - 2)
    }

    const hasLower = /[a-z]/.test(password)
    const hasUpper = /[A-Z]/.test(password)
    const hasDigit = /\d/.test(password)
    const hasSymbol = /[^a-zA-Z\d]/.test(password)
    const diversity = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length

    if (diversity >= 3) score += 1

    if (/^(.)\1{5,}$/.test(password)) {
      issues.push('Demasiada repetición de caracteres')
      score = 0
    }

    if (/(123456|abcdef|qwerty)/i.test(password)) {
      issues.push('Contiene secuencia trivial')
      score = Math.max(0, score - 1)
    }

    const normalizedScore = Math.min(4, score)
    const valid = issues.length === 0 && normalizedScore >= 2

    return {
      valid,
      isValid: valid,
      score: normalizedScore,
      issues,
      reasons: issues,
    }
  }

  private verificationResult(valid: boolean, needsRehash: boolean): PasswordVerificationResult {
    return { valid, isValid: valid, needsRehash }
  }

  private isPasswordHash(value: string): boolean {
    return /^(\$argon2|\$2[aby]\$)/.test(value)
  }

  private argon2NeedsRehash(hash: string): boolean {
    const paramsMatch = hash.match(/\$m=(\d+),t=(\d+),p=(\d+)\$/)
    if (!paramsMatch) return true

    const m = parseInt(paramsMatch[1], 10)
    const t = parseInt(paramsMatch[2], 10)
    const p = parseInt(paramsMatch[3], 10)

    return (
      m < ARGON2_OPTIONS.memoryCost ||
      t < ARGON2_OPTIONS.timeCost ||
      p < ARGON2_OPTIONS.parallelism
    )
  }
}
