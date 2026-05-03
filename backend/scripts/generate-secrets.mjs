#!/usr/bin/env node
// scripts/generate-secrets.mjs
//
// Genera secrets criptográficamente seguros para variables de entorno
// requeridas por el backend. Sin dependencias externas — solo `crypto` nativo.
//
// Uso:
//   node scripts/generate-secrets.mjs
//   node scripts/generate-secrets.mjs --format=env       (default)
//   node scripts/generate-secrets.mjs --format=json
//   node scripts/generate-secrets.mjs --format=docker    (export VAR=value)
//
// Recomendación: redirige la salida a un archivo seguro:
//   node scripts/generate-secrets.mjs > .env.secrets
//   chmod 600 .env.secrets
//
// IMPORTANT:
//   - NUNCA commitear estos secrets en git.
//   - En producción, usa un secret manager (AWS Secrets Manager, Vault,
//     Doppler, GitHub Actions Secrets, Vercel/Railway env vars).
//   - Rotación recomendada: JWT secrets cada 90 días, encryption key anual
//     (rotación de encryption requiere re-cifrar secretos 2FA existentes).

import { randomBytes } from 'node:crypto';
import { argv, exit } from 'node:process';

const SECRETS = [
  {
    name: 'JWT_SECRET',
    bytes: 32,
    description: 'Firma de access tokens JWT',
  },
  {
    name: 'JWT_REFRESH_SECRET',
    bytes: 32,
    description: 'Firma de refresh tokens JWT (debe ser distinto a JWT_SECRET)',
  },
  {
    name: 'TWO_FACTOR_ENCRYPTION_KEY',
    bytes: 32,
    description:
      'AES-256-GCM key para cifrar twoFactorSecret en DB (32 bytes = 256 bits)',
  },
  {
    name: 'SESSION_ID_SALT',
    bytes: 16,
    description: 'Salt opcional para hashes de sessionId (anti rainbow tables)',
  },
];

function generate() {
  return SECRETS.map((s) => ({
    name: s.name,
    description: s.description,
    value: randomBytes(s.bytes).toString('hex'),
  }));
}

function format(secrets, mode) {
  switch (mode) {
    case 'json':
      return JSON.stringify(
        secrets.reduce((acc, s) => ({ ...acc, [s.name]: s.value }), {}),
        null,
        2,
      );
    case 'docker':
      return secrets.map((s) => `export ${s.name}="${s.value}"`).join('\n');
    case 'env':
    default:
      return [
        '# ============================================================',
        '# Secrets generados automáticamente — NUNCA commitear este archivo',
        `# Generado: ${new Date().toISOString()}`,
        '# ============================================================',
        '',
        ...secrets.flatMap((s) => [`# ${s.description}`, `${s.name}=${s.value}`, '']),
      ].join('\n');
  }
}

function getMode() {
  const arg = argv.find((a) => a.startsWith('--format='));
  if (!arg) return 'env';
  const mode = arg.split('=')[1];
  if (!['env', 'json', 'docker'].includes(mode)) {
    console.error(`format inválido: ${mode}. Usa env|json|docker.`);
    exit(2);
  }
  return mode;
}

const secrets = generate();
const mode = getMode();
console.log(format(secrets, mode));
