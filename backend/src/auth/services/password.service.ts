import { Injectable, Logger } from '@nestjs/common'

/**
 * PasswordService — wrapper de Argon2id con backwards compatibility.
 *
 * ¿Por qué Argon2id en lugar de bcrypt?
 *  - Argon2id ganó la Password Hashing Competition (PHC) 2015.
 *  - Resistente a ataques de GPU, ASIC y side-channel mejor que bcrypt.
 *  - bcrypt tiene un límite de 72 bytes en el password (silenciosamente trunca);
 *    Argon2id no.
 *  - OWASP 2024 recomienda Argon2id como primera opción.
 *
 * Parámetros (OWASP cheat sheet 2024):
 *  - memoryCost: 64 MB (65 536 KiB)
 *  - timeCost: 3 iteraciones
 *  - parallelism: 4 hilos
 *  - hashLength: 32 bytes
 *  - saltLength: 16 bytes (default)
 *
 * Estos valores están calibrados para que un hash tome ~50–100 ms en
 * hardware moderno típico — suficientemente lento para frenar brute-force
 * pero rápido suficiente para no degradar la UX de login.
 *
 * Backwards compat: detectamos hashes bcrypt (`$2a$`, `$2b$`, `$2y$`) y
 * los verificamos con bcrypt; al cambiar password se re-hashea con Argon2id.
 */

// Carga lazy de argon2 para evitar costo si el módulo no se usa
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
  type: 2, // 2 = argon2id (la variante recomendada)
  memoryCost: 65536, // 64 MB
  timeCost: 3,
  parallelism: 4,
  hashLength: 32,
}

/**
 * Lista de passwords más comunes (subset top-100 de HaveIBeenPwned).
 * En producción cargar la lista completa desde un archivo o usar la API
 * de HIBP con k-anonimity para verificar contra >800M passwords leaked.
 */
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

@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name)

  /**
   * Hashea un password con Argon2id.
   */
  async hash(plaintext: string): Promise<string> {
    if (!plaintext || plaintext.length === 0) {
      throw new Error('Password no puede ser vacío')
    }
    return getArgon2().hash(plaintext, ARGON2_OPTIONS)
  }

  /**
   * Verifica un password contra un hash.
   *
   * Soporta hashes Argon2id (`$argon2id$...`) y bcrypt legacy (`$2[a|b|y]$...`)
   * para no romper usuarios existentes durante la migración.
   *
   * Retorna `{ valid, needsRehash }`. Si `needsRehash` es true, el caller
   * debe re-hashear con `hash()` y guardar el nuevo valor.
   */
  async verify(
    hash: string,
    plaintext: string,
  ): Promise<{ valid: boolean; needsRehash: boolean }> {
    if (!hash || !plaintext) {
      return { valid: false, needsRehash: false }
    }

    // Argon2 hash format: $argon2id$v=19$m=...,t=...,p=...$salt$hash
    if (hash.startsWith('$argon2')) {
      try {
        const valid = await getArgon2().verify(hash, plaintext)
        // Si los parámetros del hash son menores que los actuales,
        // marcar para re-hash en el próximo login exitoso.
        const needsRehash = valid && this.argon2NeedsRehash(hash)
        return { valid, needsRehash }
      } catch (err) {
        this.logger.warn(`Argon2 verify failed: ${(err as Error).message}`)
        return { valid: false, needsRehash: false }
      }
    }

    // Bcrypt legacy
    if (
      hash.startsWith('$2a$') ||
      hash.startsWith('$2b$') ||
      hash.startsWith('$2y$')
    ) {
      try {
        const valid = await getBcrypt().compare(plaintext, hash)
        // Siempre re-hashear bcrypt → argon2id en el próximo login exitoso
        return { valid, needsRehash: valid }
      } catch (err) {
        this.logger.warn(`Bcrypt verify failed: ${(err as Error).message}`)
        return { valid: false, needsRehash: false }
      }
    }

    // Formato no reconocido
    this.logger.error('Hash format no soportado')
    return { valid: false, needsRehash: false }
  }

  /**
   * Valida la fortaleza del password antes de hashearlo.
   *
   * Reglas (OWASP):
   *  - Min 8 chars (preferible 12+)
   *  - No estar en lista de passwords comunes
   *  - No ser una secuencia trivial (123456789, qwerty)
   *  - Recomendable: incluir mayúsculas, números, símbolos
   *    pero NO obligatorio (NIST 800-63B desaconseja reglas rígidas)
   */
  validateStrength(password: string): {
    valid: boolean
    score: number // 0-4
    issues: string[]
  } {
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

    // Diversidad de caracteres
    const hasLower = /[a-z]/.test(password)
    const hasUpper = /[A-Z]/.test(password)
    const hasDigit = /\d/.test(password)
    const hasSymbol = /[^a-zA-Z\d]/.test(password)
    const diversity = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length

    if (diversity >= 3) score += 1

    // Repetición trivial: aaaaaa, 111111
    if (/^(.)\1{5,}$/.test(password)) {
      issues.push('Demasiada repetición de caracteres')
      score = 0
    }

    // Secuencias triviales
    if (/(123456|abcdef|qwerty)/i.test(password)) {
      issues.push('Contiene secuencia trivial')
      score = Math.max(0, score - 1)
    }

    return {
      valid: issues.length === 0 && score >= 2,
      score: Math.min(4, score),
      issues,
    }
  }

  /**
   * Determina si un hash Argon2 fue creado con parámetros obsoletos
   * (memoria, iteraciones o paralelismo más bajos que los actuales).
   */
  private argon2NeedsRehash(hash: string): boolean {
    // El hash incluye los parámetros: $argon2id$v=19$m=65536,t=3,p=4$...
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
