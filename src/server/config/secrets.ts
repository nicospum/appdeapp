import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

export type SecretKeyName =
  | 'TYPESAFE_API_KEY'
  | 'OPENAI_API_KEY'
  | 'GEMINI_API_KEY'
  | 'GITHUB_TOKEN'
  | 'X_BEARER_TOKEN';

export interface ResolvedSecret {
  value: string | null;
  sourceScope: 'process_env' | 'windows_user_env' | 'local_secret_store' | 'none';
  maskedHint: string | null;
}

const windowsUserEnvCache = new Map<SecretKeyName, string | null>();

function getSecretsFilePath(): string {
  const dataDir = path.resolve(process.cwd(), '.data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, 'secrets.json');
}

function readLocalSecretsStore(): Partial<Record<SecretKeyName, string>> {
  try {
    const filePath = getSecretsFilePath();
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as Partial<Record<SecretKeyName, string>>;
  } catch {
    return {};
  }
}

function readDotEnvFile(): Partial<Record<SecretKeyName, string>> {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) return {};
    const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
    const out: Record<string, string> = {};
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
        if (val) out[key] = val;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function readWindowsUserEnv(key: SecretKeyName): string | null {
  if (process.platform !== 'win32') return null;
  if (windowsUserEnvCache.has(key)) {
    return windowsUserEnvCache.get(key) ?? null;
  }
  try {
    // Lee del registro HKCU\Environment en Windows sin exponer el valor en logs
    const cmd = `powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('${key}', 'User')"`;
    const out = execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).trim();
    const val = out.length > 0 ? out : null;
    windowsUserEnvCache.set(key, val);
    return val;
  } catch {
    windowsUserEnvCache.set(key, null);
    return null;
  }
}

export function maskSecretValue(val: string | null | undefined): string | null {
  if (!val || val.trim().length === 0) return null;
  const clean = val.trim();
  if (clean.length <= 8) return `•••• (${clean.length} chars)`;
  return `${clean.slice(0, 3)}••••${clean.slice(-2)} (${clean.length} chars)`;
}

export function resolveSecret(key: SecretKeyName): ResolvedSecret {
  // 1. Almacenamiento seguro local (.data/secrets.json, ignorado por git)
  const localStore = readLocalSecretsStore();
  if (localStore[key] && localStore[key]!.trim().length > 0) {
    const val = localStore[key]!.trim();
    return {
      value: val,
      sourceScope: 'local_secret_store',
      maskedHint: maskSecretValue(val),
    };
  }

  // 2. Archivo .env local (ignorado por git) o process.env
  const dotEnv = readDotEnvFile();
  const envVal = dotEnv[key] || process.env[key];
  if (envVal && envVal.trim().length > 0) {
    const val = envVal.trim();
    return {
      value: val,
      sourceScope: 'process_env',
      maskedHint: maskSecretValue(val),
    };
  }

  // 3. Variable de entorno de Usuario de Windows (HKCU\Environment)
  const winVal = readWindowsUserEnv(key);
  if (winVal && winVal.trim().length > 0) {
    return {
      value: winVal,
      sourceScope: 'windows_user_env',
      maskedHint: maskSecretValue(winVal),
    };
  }

  return {
    value: null,
    sourceScope: 'none',
    maskedHint: null,
  };
}

export function setLocalSecret(key: SecretKeyName, value: string | null): void {
  const current = readLocalSecretsStore();
  if (!value || value.trim().length === 0) {
    delete current[key];
  } else {
    current[key] = value.trim();
  }
  const filePath = getSecretsFilePath();
  fs.writeFileSync(filePath, JSON.stringify(current, null, 2), { encoding: 'utf-8', mode: 0o600 });
}

/**
 * Escanea cualquier contenido antes de escribir informes, artefactos o commits en GitHub
 * para garantizar que ningún secreto configurado se filtre jamás.
 */
export function sanitizeAndAssertNoSecrets(content: string): { sanitized: string; leakedKeys: SecretKeyName[] } {
  const keys: SecretKeyName[] = [
    'TYPESAFE_API_KEY',
    'OPENAI_API_KEY',
    'GEMINI_API_KEY',
    'GITHUB_TOKEN',
    'X_BEARER_TOKEN',
  ];
  let sanitized = content;
  const leakedKeys: SecretKeyName[] = [];

  for (const k of keys) {
    const resolved = resolveSecret(k);
    if (resolved.value && resolved.value.length >= 8) {
      if (sanitized.includes(resolved.value)) {
        leakedKeys.push(k);
        sanitized = sanitized.split(resolved.value).join(`[REDACTED_${k}]`);
      }
    }
  }
  return { sanitized, leakedKeys };
}
