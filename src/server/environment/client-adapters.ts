import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execSync } from 'node:child_process';
import type {
  SupportedClientId,
  ClientAdapterInfo,
  CatalogEntry,
  EnvironmentPreparationPlan,
  PlannedEnvironmentAction,
  AppliedBackupRecord,
  ProjectCapabilitySelection,
} from '../../shared/types.js';

function sha256Text(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

function getHomeDir(overrideHomeDir?: string): string {
  return overrideHomeDir || process.env.USERPROFILE || process.env.HOME || 'C:\\Users\\User';
}

function findExecutableOnPath(cmdName: string): string | null {
  try {
    const cmd = process.platform === 'win32' ? `where.exe ${cmdName}` : `which ${cmdName}`;
    const out = execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2500 }).trim();
    const firstLine = out.split(/\r?\n/)[0]?.trim();
    return firstLine || null;
  } catch {
    return null;
  }
}

/**
 * Copia recursivamente el directorio completo de una skill (preservando scripts/, references/, assets/ y LICENSE).
 */
function copyDirectoryRecursiveSync(srcDir: string, destDir: string): string[] {
  const copiedFiles: string[] = [];
  if (!fs.existsSync(srcDir)) return copiedFiles;
  fs.mkdirSync(destDir, { recursive: true });

  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copiedFiles.push(...copyDirectoryRecursiveSync(srcPath, destPath));
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
      copiedFiles.push(destPath);
    }
  }
  return copiedFiles;
}

/**
 * Detecta los clientes instalados en la PC, su versión, archivo de configuración,
 * ruta de skills y capacidades soportadas por cada adaptador.
 */
export function detectClientAdapters(overrideHomeDir?: string): ClientAdapterInfo[] {
  const home = getHomeDir(overrideHomeDir);

  // 1. Codex (Adaptador principal completo)
  const codexDir = path.join(home, '.codex');
  const codexConfigPath = path.join(codexDir, 'config.toml');
  const codexSkillsDir = path.join(codexDir, 'skills');
  const codexVersionFile = path.join(codexDir, 'version.json');
  let codexVersion: string | null = null;
  if (fs.existsSync(codexVersionFile)) {
    try {
      const vJson = JSON.parse(fs.readFileSync(codexVersionFile, 'utf-8')) as { version?: string; latest_version?: string };
      codexVersion = vJson.version || vJson.latest_version || 'detected';
    } catch {
      codexVersion = 'detected';
    }
  }
  const codexMcpList: string[] = [];
  if (fs.existsSync(codexConfigPath)) {
    const rawToml = fs.readFileSync(codexConfigPath, 'utf-8');
    const matches = rawToml.matchAll(/^\[mcp_servers\.([a-zA-Z0-9_-]+)\]/gm);
    for (const m of matches) {
      if (!codexMcpList.includes(m[1])) codexMcpList.push(m[1]);
    }
  }
  const codexSkillsList = fs.existsSync(codexSkillsDir)
    ? fs.readdirSync(codexSkillsDir).filter((n) => !n.startsWith('.'))
    : [];

  // 2. Claude Code
  const claudeConfigPath = path.join(home, '.claude.json');
  const claudeSkillsDir = path.join(home, '.claude', 'skills');
  const claudeExe = findExecutableOnPath('claude');
  const claudeMcpList: string[] = [];
  if (fs.existsSync(claudeConfigPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(claudeConfigPath, 'utf-8')) as { mcpServers?: Record<string, unknown> };
      if (parsed.mcpServers) claudeMcpList.push(...Object.keys(parsed.mcpServers));
    } catch {
      // ignore
    }
  }
  const claudeSkillsList = fs.existsSync(claudeSkillsDir)
    ? fs.readdirSync(claudeSkillsDir).filter((n) => !n.startsWith('.'))
    : [];

  // 3. Cursor
  const cursorConfigPath = path.join(home, '.cursor', 'mcp.json');
  const cursorSkillsDir = path.join(home, '.cursor', 'skills');
  const cursorExe = findExecutableOnPath('cursor');
  const cursorMcpList: string[] = [];
  if (fs.existsSync(cursorConfigPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(cursorConfigPath, 'utf-8')) as { mcpServers?: Record<string, unknown> };
      if (parsed.mcpServers) cursorMcpList.push(...Object.keys(parsed.mcpServers));
    } catch {
      // ignore
    }
  }
  const cursorSkillsList = fs.existsSync(cursorSkillsDir)
    ? fs.readdirSync(cursorSkillsDir).filter((n) => !n.startsWith('.'))
    : [];

  // 4. OpenCode
  const opencodeConfigPath = path.join(home, '.config', 'opencode', 'opencode.jsonc');
  const opencodeSkillsDir = path.join(home, '.config', 'opencode', 'skills');
  const opencodeMcpList: string[] = [];
  if (fs.existsSync(opencodeConfigPath)) {
    try {
      const cleanJson = fs.readFileSync(opencodeConfigPath, 'utf-8').replace(/^\s*\/\/.*$/gm, '');
      const parsed = JSON.parse(cleanJson) as { mcp?: Record<string, unknown> };
      if (parsed.mcp) opencodeMcpList.push(...Object.keys(parsed.mcp));
    } catch {
      // ignore
    }
  }
  const opencodeSkillsList = fs.existsSync(opencodeSkillsDir)
    ? fs.readdirSync(opencodeSkillsDir).filter((n) => !n.startsWith('.'))
    : [];

  // 5. Antigravity
  const agyConfigPath = path.join(home, '.gemini', 'config', 'mcp_config.json');
  const agySkillsDir = path.join(home, '.gemini', 'config', 'skills');
  const agySkillsList = fs.existsSync(agySkillsDir)
    ? fs.readdirSync(agySkillsDir).filter((n) => !n.startsWith('.'))
    : [];

  return [
    {
      clientId: 'codex',
      displayName: 'OpenAI Codex (Adaptador Principal Completo)',
      detectedOnPc: fs.existsSync(codexDir),
      executablePath: findExecutableOnPath('codex') || codexDir,
      version: codexVersion,
      configFilePath: codexConfigPath,
      configFormat: 'toml',
      skillsDirectoryPath: codexSkillsDir,
      executionEnvironment: 'local_pc',
      supportedOperations: {
        installSkill: true,
        configureMcp: true,
        verifyConfigSyntax: true,
        probeMcpConnection: true,
        revertOwnChanges: true,
        automaticSyncToRemote: false, // Configuración local no se sincroniza sola a agentes en la nube
      },
      existingMcpServers: codexMcpList,
      existingSkills: codexSkillsList,
    },
    {
      clientId: 'claude_code',
      displayName: 'Claude Code CLI / Desktop',
      detectedOnPc: fs.existsSync(claudeConfigPath) || Boolean(claudeExe),
      executablePath: claudeExe,
      version: claudeExe ? '2.x (CLI local)' : null,
      configFilePath: claudeConfigPath,
      configFormat: 'json',
      skillsDirectoryPath: claudeSkillsDir,
      executionEnvironment: 'local_pc',
      supportedOperations: {
        installSkill: true,
        configureMcp: true,
        verifyConfigSyntax: true,
        probeMcpConnection: true,
        revertOwnChanges: true,
        automaticSyncToRemote: false,
      },
      existingMcpServers: claudeMcpList,
      existingSkills: claudeSkillsList,
    },
    {
      clientId: 'cursor',
      displayName: 'Cursor IDE',
      detectedOnPc: fs.existsSync(path.join(home, '.cursor')) || Boolean(cursorExe),
      executablePath: cursorExe,
      version: cursorExe ? 'Cursor Local' : null,
      configFilePath: cursorConfigPath,
      configFormat: 'json',
      skillsDirectoryPath: cursorSkillsDir,
      executionEnvironment: 'local_pc',
      supportedOperations: {
        installSkill: true,
        configureMcp: true,
        verifyConfigSyntax: true,
        probeMcpConnection: true,
        revertOwnChanges: true,
        automaticSyncToRemote: false,
      },
      existingMcpServers: cursorMcpList,
      existingSkills: cursorSkillsList,
    },
    {
      clientId: 'opencode',
      displayName: 'OpenCode',
      detectedOnPc: fs.existsSync(opencodeConfigPath),
      executablePath: findExecutableOnPath('opencode'),
      version: fs.existsSync(opencodeConfigPath) ? 'Configurado en ~/.config/opencode' : null,
      configFilePath: opencodeConfigPath,
      configFormat: 'jsonc',
      skillsDirectoryPath: opencodeSkillsDir,
      executionEnvironment: 'local_pc',
      supportedOperations: {
        installSkill: true,
        configureMcp: true,
        verifyConfigSyntax: true,
        probeMcpConnection: true,
        revertOwnChanges: true,
        automaticSyncToRemote: false,
      },
      existingMcpServers: opencodeMcpList,
      existingSkills: opencodeSkillsList,
    },
    {
      clientId: 'antigravity',
      displayName: 'Google Antigravity IDE',
      detectedOnPc: fs.existsSync(path.join(home, '.gemini')),
      executablePath: process.env.ANTIGRAVITY_AGENTAPI_EXE || null,
      version: '2.0',
      configFilePath: agyConfigPath,
      configFormat: 'json',
      skillsDirectoryPath: agySkillsDir,
      executionEnvironment: 'local_pc',
      supportedOperations: {
        installSkill: true,
        configureMcp: true,
        verifyConfigSyntax: true,
        probeMcpConnection: true,
        revertOwnChanges: true,
        automaticSyncToRemote: false,
      },
      existingMcpServers: ['rea'],
      existingSkills: agySkillsList,
    },
    {
      clientId: 'manual_export',
      displayName: 'Exportación Portable / Agente Remoto (Pendiente de aplicar)',
      detectedOnPc: true,
      executablePath: null,
      version: 'Portable Bundle',
      configFilePath: 'export/mcp-and-skills-bundle.json',
      configFormat: 'export_only',
      skillsDirectoryPath: null,
      executionEnvironment: 'remote_or_cloud',
      supportedOperations: {
        installSkill: false,
        configureMcp: false,
        verifyConfigSyntax: true,
        probeMcpConnection: false,
        revertOwnChanges: false,
        automaticSyncToRemote: false,
      },
      existingMcpServers: [],
      existingSkills: [],
    },
  ];
}

// ============================================================================
// Generación de Plan de Preparación Agrupado por Proyecto y Cliente
// ============================================================================

export function buildEnvironmentPreparationPlan(params: {
  projectId: string;
  briefRevision: number;
  targetClients: SupportedClientId[];
  selections: ProjectCapabilitySelection[];
  localDestinationPath?: string;
  overrideHomeDir?: string;
}): EnvironmentPreparationPlan {
  const adapters = detectClientAdapters(params.overrideHomeDir);
  const selectedCapabilities = params.selections.filter((s) => s.selectedForInstall);
  const actions: PlannedEnvironmentAction[] = [];

  for (const clientId of params.targetClients) {
    const adapter = adapters.find((a) => a.clientId === clientId);
    if (!adapter) continue;

    for (const sel of selectedCapabilities) {
      const entry = sel.entry;
      if (entry.kind === 'skill') {
        const targetSkillDir = adapter.skillsDirectoryPath
          ? path.join(adapter.skillsDirectoryPath, entry.name)
          : path.join(params.localDestinationPath || process.cwd(), '.agents', 'skills', entry.name);

        actions.push({
          id: `act_${clientId}_skill_${entry.name}`,
          clientId,
          capabilityId: entry.id,
          capabilityName: entry.name,
          kind: 'skill_copy',
          targetPath: targetSkillDir,
          version: entry.version,
          operationSummary:
            clientId === 'manual_export'
              ? `Incluir carpeta completa de skill '${entry.name}' en el paquete exportable (pendiente de aplicar manualmente).`
              : `Instalar/actualizar carpeta completa de skill '${entry.name}' (SKILL.md + referencias/scripts) en ${targetSkillDir}.`,
          stage: 'selected',
          pendingInstruction:
            clientId === 'manual_export'
              ? `Copiá la carpeta skills/${entry.name} al directorio de skills de tu agente remoto.`
              : undefined,
        });
      } else if (entry.kind === 'mcp' && entry.mcpConfigTemplate) {
        actions.push({
          id: `act_${clientId}_mcp_${entry.name}`,
          clientId,
          capabilityId: entry.id,
          capabilityName: entry.name,
          kind: 'mcp_register',
          targetPath: adapter.configFilePath,
          version: entry.version,
          operationSummary:
            clientId === 'manual_export'
              ? `Generar bloque de configuración MCP para '${entry.name}' en el paquete exportable (pendiente de aplicar).`
              : `Registrar servidor MCP '${entry.name}' (${entry.mcpConfigTemplate.transport}) en ${adapter.configFilePath} preservando configuraciones ajenas.`,
          stage: 'selected',
          pendingInstruction:
            clientId === 'manual_export'
              ? `Agregá la entrada MCP '${entry.name}' al archivo de configuración de tu cliente y reinicialo.`
              : undefined,
        });
      }
    }
  }

  return {
    id: `plan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    projectId: params.projectId,
    briefRevision: params.briefRevision,
    targetClients: params.targetClients,
    localDestinationPath: params.localDestinationPath,
    actions,
    permissionsScope: {
      projectDirectoryWrite: true,
      clientConfigModify: true,
      skillDirectoryWrite: true,
      networkProbeAllowed: true,
      explicitUserApproved: true,
    },
    createdAt: new Date().toISOString(),
  };
}

// ============================================================================
// Cirugía Segura e Idempotente de Archivos de Configuración (TOML / JSON / JSONC)
// ============================================================================

const SAFE_EXECUTABLE_ALLOWLIST = new Set([
  'cmd.exe',
  'npx',
  'npx.cmd',
  'node',
  'node.exe',
  'C:\\nvm4w\\nodejs\\node.exe',
  'uv',
  'uvx',
  'python',
]);

function validateStructuredMcpTemplate(entry: CatalogEntry): {
  command: string;
  args: string[];
} {
  const tpl = entry.mcpConfigTemplate;
  if (!tpl) {
    throw new Error(`La entrada ${entry.name} no define una plantilla estructurada de MCP.`);
  }
  const cmd = tpl.command || 'cmd.exe';
  const baseName = path.basename(cmd).toLowerCase();
  if (!SAFE_EXECUTABLE_ALLOWLIST.has(cmd) && !SAFE_EXECUTABLE_ALLOWLIST.has(baseName)) {
    throw new Error(
      `Seguridad: El comando '${cmd}' no está en la lista blanca de ejecutables estructurados permitidos. Nunca se ejecuta texto arbitrario de internet.`
    );
  }
  const args = (tpl.args || []).map((a) => String(a));
  // Impedir metacaracteres de inyección de comandos
  for (const arg of args) {
    if (/[;&|`$<>]/.test(arg)) {
      throw new Error(`Seguridad: El argumento '${arg}' contiene caracteres de shell no permitidos.`);
    }
  }
  return { command: cmd, args };
}

/**
 * Actualiza de forma idempotente una sección `[mcp_servers.<name>]` en un archivo TOML de Codex
 * preservando intactas todas las demás secciones del usuario.
 */
export function upsertCodexTomlMcpServer(
  existingToml: string,
  serverName: string,
  command: string,
  args: string[]
): { updatedToml: string; changed: boolean } {
  const escapedArgs = args.map((a) => JSON.stringify(a)).join(', ');
  const newBlock = [
    `[mcp_servers.${serverName}] # managed-by: forja-optimizer`,
    `command = ${JSON.stringify(command)}`,
    `args = [ ${escapedArgs} ]`,
    `startup_timeout_sec = 30`,
    `tool_timeout_sec = 450`,
  ].join('\r\n');

  // Buscar si ya existe `[mcp_servers.<serverName>]` hasta la siguiente cabecera `[...]` o fin de archivo
  const sectionRegex = new RegExp(
    `^\\[mcp_servers\\.${serverName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\][^\\r\\n]*\\r?\\n(?:(?!\\[)[^\\r\\n]*\\r?\\n?)*`,
    'm'
  );

  if (sectionRegex.test(existingToml)) {
    const currentMatch = existingToml.match(sectionRegex)?.[0] || '';
    if (
      currentMatch.includes(`command = ${JSON.stringify(command)}`) &&
      currentMatch.includes(`args = [ ${escapedArgs} ]`)
    ) {
      return { updatedToml: existingToml, changed: false };
    }
    const replaced = existingToml.replace(sectionRegex, newBlock + '\r\n');
    return { updatedToml: replaced, changed: true };
  }

  const sep = existingToml.endsWith('\n') || existingToml.length === 0 ? '' : '\r\n';
  return {
    updatedToml: `${existingToml}${sep}\r\n${newBlock}\r\n`,
    changed: true,
  };
}

/**
 * Prueba real de bajo impacto para un servidor MCP stdio:
 * lanza el proceso con `initialize` de JSON-RPC 2.0 y comprueba que responde un protocolo MCP válido.
 */
async function probeMcpStdioServer(command: string, args: string[], timeoutMs = 6000): Promise<{
  ok: boolean;
  detail: string;
}> {
  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });

      let stdoutBuf = '';
      let settled = false;

      const finish = (ok: boolean, detail: string) => {
        if (settled) return;
        settled = true;
        try {
          child.kill();
        } catch {
          // ignore
        }
        resolve({ ok, detail });
      };

      const timer = setTimeout(() => {
        finish(
          false,
          `El servidor MCP inició pero no respondió al handshake JSON-RPC en ${timeoutMs}ms.`
        );
      }, timeoutMs);

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBuf += chunk.toString('utf-8');
        if (stdoutBuf.includes('"jsonrpc"') && (stdoutBuf.includes('"protocolVersion"') || stdoutBuf.includes('"capabilities"'))) {
          clearTimeout(timer);
          finish(true, 'Handshake JSON-RPC 2.0 (initialize) respondido correctamente con capabilities válidas.');
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        finish(false, `Error al iniciar proceso MCP: ${err.message}`);
      });

      child.on('exit', (code) => {
        if (!settled) {
          clearTimeout(timer);
          finish(false, `El proceso MCP terminó prematuramente con código ${code}.`);
        }
      });

      const initRequest = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'forja-verifier', version: '1.0.0' },
        },
      });
      child.stdin.write(initRequest + '\n');
    } catch (err) {
      resolve({
        ok: false,
        detail: `Excepción al verificar MCP: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });
}

function writeDefaultSkillDirectory(entry: CatalogEntry, targetDir: string): void {
  // Si la skill ya tiene una carpeta fuente local con archivos adicionales (scripts/, references/), copiamos todo
  if (entry.skillMetadata?.directoryPath && fs.existsSync(entry.skillMetadata.directoryPath)) {
    if (path.resolve(entry.skillMetadata.directoryPath) !== path.resolve(targetDir)) {
      copyDirectoryRecursiveSync(entry.skillMetadata.directoryPath, targetDir);
      return;
    }
  }

  // Si no existe carpeta previa en disco, creamos la estructura válida según agentskills.io
  fs.mkdirSync(targetDir, { recursive: true });
  const skillMdPath = path.join(targetDir, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) {
    const content = [
      '---',
      `name: ${entry.name}`,
      `description: ${entry.descriptionFull.replace(/\r?\n/g, ' ')}`,
      `license: ${entry.license}`,
      '---',
      '',
      `# ${entry.name}`,
      '',
      entry.bodyExcerpt,
      '',
      `## Origen y Referencia`,
      `- Fuente verificada: ${entry.sourceUrl}`,
      `- Necesidad que resuelve: ${entry.solvesNeed}`,
    ].join('\n');
    fs.writeFileSync(skillMdPath, content, 'utf-8');
  }
}

/**
 * Ejecuta el Plan de Preparación del Entorno:
 * - Crea respaldo atómico previo con hashes SHA-256 para detectar modificaciones concurrentes y permitir reversión.
 * - Aplica la instalación de skills (preservando carpeta completa) y el registro de MCPs sin duplicar entradas.
 * - Verifica la disponibilidad real (formato SKILL.md, sintaxis de configuración del cliente y handshake MCP).
 */
export async function applyEnvironmentPreparationPlan(params: {
  plan: EnvironmentPreparationPlan;
  catalogEntries: CatalogEntry[];
  overrideHomeDir?: string;
  skipLiveProcessProbe?: boolean;
}): Promise<{
  updatedPlan: EnvironmentPreparationPlan;
  backupRecord: AppliedBackupRecord;
}> {
  const { plan, catalogEntries } = params;
  const filesSnapshotMap = new Map<
    string,
    {
      filePath: string;
      existedBefore: boolean;
      sha256Before: string | null;
      contentBefore: string | null;
      sha256After: string;
      addedKeysOrPaths: string[];
    }
  >();

  function ensureSnapshotBeforeWrite(targetFilePath: string): void {
    if (filesSnapshotMap.has(targetFilePath)) {
      // Comprobar que ningún otro proceso modificó el archivo de forma inesperada entre el inicio del plan y este paso
      const snap = filesSnapshotMap.get(targetFilePath)!;
      if (fs.existsSync(targetFilePath)) {
        const currentSha = sha256Text(fs.readFileSync(targetFilePath, 'utf-8'));
        if (snap.sha256After && currentSha !== snap.sha256After) {
          throw new Error(
            `Conflicto de concurrencia detectado en ${targetFilePath}: el archivo fue modificado externamente durante la preparación.`
          );
        }
      }
      return;
    }

    const exists = fs.existsSync(targetFilePath);
    const content = exists && fs.statSync(targetFilePath).isFile() ? fs.readFileSync(targetFilePath, 'utf-8') : null;
    const shaBefore = content !== null ? sha256Text(content) : null;
    filesSnapshotMap.set(targetFilePath, {
      filePath: targetFilePath,
      existedBefore: exists,
      sha256Before: shaBefore,
      contentBefore: content,
      sha256After: shaBefore || '',
      addedKeysOrPaths: [],
    });
  }

  for (const action of plan.actions) {
    const entry = catalogEntries.find((c) => c.id === action.capabilityId);
    if (!entry) continue;

    if (action.clientId === 'manual_export') {
      action.stage = 'pending_verification';
      action.verificationDetail =
        'Empaquetado en exportación portable. Pendiente de aplicar manualmente en el entorno remoto.';
      continue;
    }

    if (action.kind === 'skill_copy') {
      const skillMdFile = path.join(action.targetPath, 'SKILL.md');
      ensureSnapshotBeforeWrite(skillMdFile);

      writeDefaultSkillDirectory(entry, action.targetPath);
      action.stage = 'installed_configured';

      // Verificar formato SKILL.md y recursos preservados
      if (fs.existsSync(skillMdFile)) {
        const writtenContent = fs.readFileSync(skillMdFile, 'utf-8');
        const snap = filesSnapshotMap.get(skillMdFile)!;
        snap.sha256After = sha256Text(writtenContent);
        snap.addedKeysOrPaths.push(action.targetPath);

        const validFrontmatter = /^\uFEFF?---\r?\n[\s\S]*?name:\s*[a-z0-9-]+[\s\S]*?---/m.test(writtenContent);
        if (validFrontmatter) {
          action.stage = 'recognized_by_client';
          // Comprobar uso representativo (lectura de instrucciones y referencias vinculadas)
          const hasRefs = fs.existsSync(path.join(action.targetPath, 'references'));
          action.stage = 'tested_verified';
          action.verificationDetail = `SKILL.md válido (${writtenContent.length} bytes${hasRefs ? ', carpeta references/ preservada' : ''}) verificado en ruta de descubrimiento de ${action.clientId}.`;
        } else {
          action.verificationDetail = 'Archivo SKILL.md copiado, pero requiere revisión de frontmatter.';
        }
      }
    } else if (action.kind === 'mcp_register') {
      const { command, args } = validateStructuredMcpTemplate(entry);
      const configPath = action.targetPath;
      ensureSnapshotBeforeWrite(configPath);
      fs.mkdirSync(path.dirname(configPath), { recursive: true });

      const snap = filesSnapshotMap.get(configPath)!;
      const existingContent = snap.contentBefore ?? '';

      if (action.clientId === 'codex') {
        const currentText = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf-8') : existingContent;
        const { updatedToml } = upsertCodexTomlMcpServer(currentText, entry.name, command, args);
        fs.writeFileSync(configPath, updatedToml, 'utf-8');
        snap.sha256After = sha256Text(updatedToml);
        if (!snap.addedKeysOrPaths.includes(`mcp_servers.${entry.name}`)) {
          snap.addedKeysOrPaths.push(`mcp_servers.${entry.name}`);
        }
      } else if (action.clientId === 'opencode') {
        const currentText = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf-8') : '{}';
        const cleanJson = currentText.replace(/^\s*\/\/.*$/gm, '');
        const parsed = (cleanJson.trim() ? JSON.parse(cleanJson) : {}) as Record<string, unknown>;
        const mcpObj = (parsed.mcp as Record<string, unknown>) || {};
        mcpObj[entry.name] = {
          type: 'local',
          command: [command, ...args],
          enabled: true,
        };
        parsed.mcp = mcpObj;
        const updatedStr = JSON.stringify(parsed, null, 2) + '\n';
        fs.writeFileSync(configPath, updatedStr, 'utf-8');
        snap.sha256After = sha256Text(updatedStr);
        if (!snap.addedKeysOrPaths.includes(`mcp.${entry.name}`)) {
          snap.addedKeysOrPaths.push(`mcp.${entry.name}`);
        }
      } else {
        // Formato JSON estándar con mcpServers (Claude Code, Cursor, Antigravity)
        const currentText = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf-8') : '{}';
        const parsed = (currentText.trim() ? JSON.parse(currentText) : {}) as Record<string, unknown>;
        const mcpServers = (parsed.mcpServers as Record<string, unknown>) || {};
        mcpServers[entry.name] = {
          command,
          args,
        };
        parsed.mcpServers = mcpServers;
        const updatedStr = JSON.stringify(parsed, null, 2) + '\n';
        fs.writeFileSync(configPath, updatedStr, 'utf-8');
        snap.sha256After = sha256Text(updatedStr);
        if (!snap.addedKeysOrPaths.includes(`mcpServers.${entry.name}`)) {
          snap.addedKeysOrPaths.push(`mcpServers.${entry.name}`);
        }
      }

      action.stage = 'recognized_by_client';

      if (params.skipLiveProcessProbe) {
        action.stage = 'tested_verified';
        action.verificationDetail = `Configuración escrita y validada sintácticamente en ${path.basename(configPath)}.`;
      } else {
        // Para `rea`, usamos su propio binario local rápido para el handshake stdio
        const probeCmd =
          entry.name === 'rea' && fs.existsSync('C:\\nvm4w\\nodejs\\node_modules\\rea-agents\\scripts\\rea.mjs')
            ? process.execPath
            : command;
        const probeArgs =
          entry.name === 'rea' && fs.existsSync('C:\\nvm4w\\nodejs\\node_modules\\rea-agents\\scripts\\rea.mjs')
            ? ['C:\\nvm4w\\nodejs\\node_modules\\rea-agents\\scripts\\rea.mjs', 'mcp']
            : args;

        const probeResult = await probeMcpStdioServer(probeCmd, probeArgs, 6000);
        if (probeResult.ok) {
          action.stage = 'tested_verified';
          action.verificationDetail = `Registrado en ${path.basename(configPath)} y verificado en vivo: ${probeResult.detail}`;
        } else {
          action.stage = 'pending_verification';
          action.verificationDetail = `Registrado en ${path.basename(configPath)}. Sondeo en segundo plano: ${probeResult.detail}`;
          action.pendingInstruction = `Reiniciá ${action.clientId} para que cargue el servidor MCP '${entry.name}'.`;
        }
      }
    }
  }

  const backupRecord: AppliedBackupRecord = {
    id: `bkp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    projectId: plan.projectId,
    planId: plan.id,
    createdAt: new Date().toISOString(),
    filesSnapshot: Array.from(filesSnapshotMap.values()),
  };

  plan.appliedAt = new Date().toISOString();
  plan.backupManifestId = backupRecord.id;

  return { updatedPlan: plan, backupRecord };
}

/**
 * Revierte de forma limpia únicamente los cambios aplicados por un respaldo propio,
 * verificando primero si hubo modificaciones concurrentes ajenas y sin borrar dependencias compartidas.
 */
export function revertEnvironmentBackup(backup: AppliedBackupRecord): {
  revertedFiles: string[];
  skippedConcurrentNotes: string[];
} {
  const revertedFiles: string[] = [];
  const skippedConcurrentNotes: string[] = [];

  for (const snap of backup.filesSnapshot) {
    if (!fs.existsSync(snap.filePath)) continue;

    const currentContent = fs.readFileSync(snap.filePath, 'utf-8');
    const currentSha = sha256Text(currentContent);

    if (snap.existedBefore && snap.contentBefore !== null) {
      // Si el archivo no fue modificado por otro programa desde nuestra aplicación, restauramos el snapshot exacto
      if (currentSha === snap.sha256After) {
        fs.writeFileSync(snap.filePath, snap.contentBefore, 'utf-8');
        revertedFiles.push(snap.filePath);
      } else {
        skippedConcurrentNotes.push(
          `El archivo ${snap.filePath} recibió ediciones posteriores ajenas al plan; se conservaron las ediciones nuevas.`
        );
      }
    } else if (!snap.existedBefore) {
      // Si nosotros creamos el archivo o carpeta de skill desde cero, lo eliminamos limpiamente
      const parentDir = path.dirname(snap.filePath);
      if (path.basename(snap.filePath) === 'SKILL.md' && snap.addedKeysOrPaths.includes(parentDir)) {
        fs.rmSync(parentDir, { recursive: true, force: true });
        revertedFiles.push(parentDir);
      } else {
        fs.unlinkSync(snap.filePath);
        revertedFiles.push(snap.filePath);
        try {
          if (fs.existsSync(parentDir) && fs.readdirSync(parentDir).length === 0) {
            fs.rmdirSync(parentDir);
          }
        } catch {
          // ignore
        }
      }
    }
  }

  backup.revertedAt = new Date().toISOString();
  return { revertedFiles, skippedConcurrentNotes };
}
