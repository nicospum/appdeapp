import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {
  initDatabase,
  listJevEvaluations,
  saveProject,
} from './storage/db.js';
import {
  resolveSecret,
  setLocalSecret,
  type SecretKeyName,
} from './config/secrets.js';
import { probeTypeSafeConnection, type TypeSafeModelInfo } from './providers/jev-service.js';
import {
  inspectReaSystemStatus,
  analyzeLocalJsTargetWithRea,
} from './providers/rea-adapter.js';
import {
  ensureCatalogSeeded,
  validateAndAddCustomCatalogEntry,
} from './catalog/catalog-service.js';
import { detectClientAdapters } from './environment/client-adapters.js';
import {
  startOrResumeResearchRun,
  cancelResearchRun,
} from './research/research-engine.js';
import {
  OPTIMIZER_OWN_STACK_DECISION,
  PRIORITY_PRESETS,
} from './stack/stack-comparator.js';
import {
  createFullProject,
  getProjectById,
  listProjects,
  deleteProject,
  getBriefRevisions,
  updateProjectBrief,
  updateProjectStackDecision,
  updateProjectCapabilitiesAndPlan,
  executeProjectEnvironmentPreparation,
  revertProjectEnvironmentPreparation,
  applyArtifactsToLocalDirectory,
  prepareGitHubBranchDelivery,
} from './project/project-service.js';
import { inspectExistingProject } from './project/existing-inspector.js';
import {
  CreateProjectInputSchema,
  UpdateBriefInputSchema,
  StartResearchInputSchema,
  AddCatalogCustomItemSchema,
  type ProviderConnectionStatus,
  type PriorityPresetId,
  type DimensionWeights,
  type SupportedClientId,
} from '../shared/types.js';

let lastTypeSafeProbeState: {
  verifiedAt?: string;
  ok?: boolean;
  models?: TypeSafeModelInfo[];
  message?: string;
} = {};

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf-8').trim();
        if (!raw) return resolve({});
        resolve(JSON.parse(raw) as Record<string, unknown>);
      } catch (err) {
        reject(new Error(`JSON inválido en el cuerpo de la solicitud: ${err instanceof Error ? err.message : String(err)}`));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

export async function getConnectionsSummary(): Promise<ProviderConnectionStatus[]> {
  const ts = resolveSecret('TYPESAFE_API_KEY');
  const oa = resolveSecret('OPENAI_API_KEY');
  const gm = resolveSecret('GEMINI_API_KEY');
  const gh = resolveSecret('GITHUB_TOKEN');
  const xb = resolveSecret('X_BEARER_TOKEN');
  const reaStatus = await inspectReaSystemStatus();

  const genSource = oa.value ? oa : gm;

  return [
    {
      provider: 'typesafe',
      displayName: 'TypeSafe AI — Jev (System One API)',
      configured: Boolean(ts.value),
      sourceScope: ts.sourceScope,
      maskedHint: ts.maskedHint,
      lastVerifiedAt: lastTypeSafeProbeState.verifiedAt,
      lastVerificationStatus:
        lastTypeSafeProbeState.ok === undefined
          ? 'untested'
          : lastTypeSafeProbeState.ok
          ? 'ok'
          : 'error',
      availableModels: lastTypeSafeProbeState.models,
      statusMessage: ts.value
        ? lastTypeSafeProbeState.message ||
          `TYPESAFE_API_KEY detectada en '${ts.sourceScope}'. Usá "Probar conexión" para verificar modelos /v1/models y /v1/systemone.`
        : 'Sin TYPESAFE_API_KEY configurada. Jev reportará estado de autenticación pendiente sin inventar puntajes.',
    },
    {
      provider: 'rea_local',
      displayName: 'REA — Reverse Engineer Anything (rea-agents)',
      configured: reaStatus.cliInstalled,
      sourceScope: reaStatus.cliInstalled ? 'process_env' : 'none',
      maskedHint: reaStatus.cliVersion ? `rea-agents@${reaStatus.cliVersion}` : null,
      lastVerifiedAt: reaStatus.checkedAt,
      lastVerificationStatus: reaStatus.cliInstalled ? 'ok' : 'error',
      statusMessage: reaStatus.cliInstalled
        ? `CLI rea-agents@${reaStatus.cliVersion} disponible. Skill v${reaStatus.installedSkillVersion || '49'} (${
            reaStatus.skillAligned ? 'alineada' : 'revisar'
          }). MCP conectado en host activo.`
        : 'CLI rea-agents no detectado.',
    },
    {
      provider: 'generative_llm',
      displayName: 'Modelo Generativo (Síntesis y Redacción)',
      configured: Boolean(genSource.value),
      sourceScope: genSource.sourceScope,
      maskedHint: genSource.maskedHint,
      lastVerificationStatus: genSource.value ? 'ok' : 'untested',
      statusMessage: genSource.value
        ? `Credencial generativa activa (${oa.value ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY'} en '${genSource.sourceScope}'). Separada de Jev.`
        : 'Opcional: sin clave generativa externa; se utiliza el motor estructurado local + evaluación tipada de Jev.',
    },
    {
      provider: 'github',
      displayName: 'GitHub API y Ramas de Destino',
      configured: Boolean(gh.value),
      sourceScope: gh.sourceScope,
      maskedHint: gh.maskedHint,
      lastVerificationStatus: gh.value ? 'ok' : 'untested',
      statusMessage: gh.value
        ? `GITHUB_TOKEN configurada en '${gh.sourceScope}' para consultas de mayor cuota y push de ramas.`
        : 'Usando API pública de GitHub para lectura de repositorios/commits y Git local para preparación de ramas.',
    },
    {
      provider: 'x_api',
      displayName: 'X (Twitter) API v2 (/2/tweets/search/recent)',
      configured: Boolean(xb.value),
      sourceScope: xb.sourceScope,
      maskedHint: xb.maskedHint,
      lastVerificationStatus: xb.value ? 'ok' : 'untested',
      statusMessage: xb.value
        ? `X_BEARER_TOKEN configurada en '${xb.sourceScope}'.`
        : 'Sin X_BEARER_TOKEN: el adaptador degrada limpiamente a cobertura pública indexada y marca la API directa de X como pendiente.',
    },
  ];
}

export async function handleApiRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<boolean> {
  const urlObj = new URL(req.url || '/', 'http://localhost');
  const pathname = urlObj.pathname;
  const method = req.method || 'GET';

  if (!pathname.startsWith('/api/')) {
    return false;
  }

  initDatabase();
  ensureCatalogSeeded();

  try {
    // 1. Health & Meta
    if (pathname === '/api/health' && method === 'GET') {
      sendJson(res, 200, {
        ok: true,
        timestamp: new Date().toISOString(),
        optimizerStackDecision: OPTIMIZER_OWN_STACK_DECISION,
        priorityPresets: PRIORITY_PRESETS,
      });
      return true;
    }

    // 2. Conexiones y Secretos
    if (pathname === '/api/connections' && method === 'GET') {
      const connections = await getConnectionsSummary();
      sendJson(res, 200, { connections });
      return true;
    }

    if (pathname === '/api/connections/secret' && method === 'POST') {
      const body = await readJsonBody(req);
      const key = String(body.key || '') as SecretKeyName;
      const validKeys: SecretKeyName[] = [
        'TYPESAFE_API_KEY',
        'OPENAI_API_KEY',
        'GEMINI_API_KEY',
        'GITHUB_TOKEN',
        'X_BEARER_TOKEN',
      ];
      if (!validKeys.includes(key)) {
        sendJson(res, 400, { error: `Nombre de clave no soportado: ${key}` });
        return true;
      }
      const value = body.value === null || body.value === undefined ? null : String(body.value);
      setLocalSecret(key, value);
      const connections = await getConnectionsSummary();
      sendJson(res, 200, { ok: true, connections });
      return true;
    }

    if (pathname === '/api/connections/probe-typesafe' && method === 'POST') {
      const body = await readJsonBody(req);
      const overrideKey = typeof body.apiKey === 'string' && body.apiKey.trim() ? body.apiKey.trim() : undefined;
      const result = await probeTypeSafeConnection(overrideKey);
      lastTypeSafeProbeState = {
        verifiedAt: new Date().toISOString(),
        ok: result.ok,
        models: result.models,
        message: result.ok
          ? `Conexión verificada con éxito. Modelos activos: ${result.models.map((m) => m.name).join(', ')}. Modelo usado en prueba: ${result.probeEvaluation.modelUsed} (${result.probeEvaluation.latencyMs}ms).`
          : result.probeEvaluation.errorMessage,
      };
      const connections = await getConnectionsSummary();
      sendJson(res, result.ok ? 200 : 400, {
        ...result,
        connections,
      });
      return true;
    }

    // 3. Estado y Análisis REA
    if (pathname === '/api/rea/status' && method === 'GET') {
      const status = await inspectReaSystemStatus(urlObj.searchParams.get('refresh') === 'true');
      sendJson(res, 200, { status });
      return true;
    }

    if (pathname === '/api/rea/analyze' && method === 'POST') {
      const body = await readJsonBody(req);
      const projectId = String(body.projectId || '');
      const targetPath = String(body.targetPath || '');
      const projectNeed = String(
        body.projectNeed || 'Estudiar estructura modular y comportamiento observable para reutilizar patrones.'
      );
      if (!projectId || !targetPath) {
        sendJson(res, 400, { error: 'Se requiere projectId y targetPath.' });
        return true;
      }
      const project = getProjectById(projectId);
      if (!project) {
        sendJson(res, 404, { error: 'Proyecto no encontrado.' });
        return true;
      }
      const card = await analyzeLocalJsTargetWithRea(projectId, targetPath, projectNeed);
      project.reaCards.unshift(card);
      saveProject(project);
      sendJson(res, 200, { card, project });
      return true;
    }

    // 4. Catálogo y Clientes
    if (pathname === '/api/catalog' && method === 'GET') {
      const entries = ensureCatalogSeeded();
      sendJson(res, 200, { entries });
      return true;
    }

    if (pathname === '/api/catalog' && method === 'POST') {
      const body = await readJsonBody(req);
      const parsed = AddCatalogCustomItemSchema.safeParse(body);
      if (!parsed.success) {
        sendJson(res, 400, { error: parsed.error.errors.map((e) => e.message).join('; ') });
        return true;
      }
      const entry = validateAndAddCustomCatalogEntry(parsed.data);
      const entries = ensureCatalogSeeded();
      sendJson(res, 201, { entry, entries });
      return true;
    }

    if (pathname === '/api/clients' && method === 'GET') {
      const clients = detectClientAdapters();
      sendJson(res, 200, { clients });
      return true;
    }

    if (pathname === '/api/jev/evaluations' && method === 'GET') {
      const projectId = urlObj.searchParams.get('projectId') || undefined;
      const evaluations = listJevEvaluations(projectId);
      sendJson(res, 200, { evaluations });
      return true;
    }

    if (pathname === '/api/inspect-directory' && method === 'POST') {
      const body = await readJsonBody(req);
      const targetPath = String(body.path || '');
      const featureText = String(body.featureText || 'Nueva funcionalidad');
      const inspection = inspectExistingProject(targetPath, featureText);
      sendJson(res, 200, { inspection });
      return true;
    }

    // 5. Proyectos CRUD y Operaciones
    if (pathname === '/api/projects' && method === 'GET') {
      const projects = listProjects();
      sendJson(res, 200, { projects });
      return true;
    }

    if (pathname === '/api/projects' && method === 'POST') {
      const body = await readJsonBody(req);
      const parsed = CreateProjectInputSchema.safeParse(body);
      if (!parsed.success) {
        sendJson(res, 400, { error: parsed.error.errors.map((e) => e.message).join('; ') });
        return true;
      }
      const project = await createFullProject(parsed.data);
      sendJson(res, 201, { project });
      return true;
    }

    const projectMatch = pathname.match(/^\/api\/projects\/([^/]+)(?:\/(.*))?$/);
    if (projectMatch) {
      const projectId = decodeURIComponent(projectMatch[1]);
      const subRoute = projectMatch[2] || '';

      if (!subRoute && method === 'GET') {
        const project = getProjectById(projectId);
        if (!project) {
          sendJson(res, 404, { error: 'Proyecto no encontrado.' });
          return true;
        }
        const revisions = getBriefRevisions(projectId);
        const jevEvaluations = listJevEvaluations(projectId);
        sendJson(res, 200, { project, revisions, jevEvaluations });
        return true;
      }

      if (!subRoute && method === 'DELETE') {
        const deleted = deleteProject(projectId);
        sendJson(res, deleted ? 200 : 404, { deleted });
        return true;
      }

      if (subRoute === 'brief' && (method === 'PATCH' || method === 'POST')) {
        const body = await readJsonBody(req);
        const parsed = UpdateBriefInputSchema.safeParse(body);
        if (!parsed.success) {
          sendJson(res, 400, { error: parsed.error.errors.map((e) => e.message).join('; ') });
          return true;
        }
        const project = await updateProjectBrief(projectId, parsed.data);
        const revisions = getBriefRevisions(projectId);
        sendJson(res, 200, { project, revisions });
        return true;
      }

      if (subRoute === 'research' && method === 'POST') {
        const body = await readJsonBody(req);
        const resumeRunId = typeof body.resumeRunId === 'string' ? body.resumeRunId : undefined;
        const parsed = StartResearchInputSchema.safeParse(body);
        if (!parsed.success && !resumeRunId) {
          sendJson(res, 400, { error: parsed.error.errors.map((e) => e.message).join('; ') });
          return true;
        }
        const run = await startOrResumeResearchRun({
          projectId,
          ...(parsed.success ? parsed.data : {}),
          resumeRunId,
        });
        const project = getProjectById(projectId);
        sendJson(res, 200, { run, project });
        return true;
      }

      const cancelResearchMatch = subRoute.match(/^research\/([^/]+)\/cancel$/);
      if (cancelResearchMatch && method === 'POST') {
        const runId = cancelResearchMatch[1];
        const run = cancelResearchRun(projectId, runId);
        const project = getProjectById(projectId);
        sendJson(res, 200, { run, project });
        return true;
      }

      if (subRoute === 'stack' && method === 'POST') {
        const body = await readJsonBody(req);
        const preset = body.preset as PriorityPresetId | undefined;
        const customWeights = body.customWeights as DimensionWeights | undefined;
        const selectedOptionId = typeof body.selectedOptionId === 'string' ? body.selectedOptionId : undefined;
        const project = await updateProjectStackDecision(projectId, {
          preset,
          customWeights,
          selectedOptionId,
        });
        sendJson(res, 200, { project });
        return true;
      }

      if (subRoute === 'capabilities' && method === 'POST') {
        const body = await readJsonBody(req);
        const selectedCatalogIds = Array.isArray(body.selectedCatalogIds)
          ? (body.selectedCatalogIds as string[])
          : undefined;
        const targetClients = Array.isArray(body.targetClients)
          ? (body.targetClients as SupportedClientId[])
          : undefined;
        const project = updateProjectCapabilitiesAndPlan(projectId, {
          selectedCatalogIds,
          targetClients,
        });
        sendJson(res, 200, { project });
        return true;
      }

      if (subRoute === 'environment/apply' && method === 'POST') {
        const body = await readJsonBody(req);
        const planId = typeof body.planId === 'string' ? body.planId : undefined;
        const result = await executeProjectEnvironmentPreparation(projectId, { planId });
        const clients = detectClientAdapters();
        sendJson(res, 200, { ...result, clients });
        return true;
      }

      if (subRoute === 'environment/revert' && method === 'POST') {
        const body = await readJsonBody(req);
        const backupId = typeof body.backupId === 'string' ? body.backupId : undefined;
        const result = revertProjectEnvironmentPreparation(projectId, backupId);
        const clients = detectClientAdapters();
        sendJson(res, 200, { ...result, clients });
        return true;
      }

      if (subRoute === 'export/local' && method === 'POST') {
        const body = await readJsonBody(req);
        const project = getProjectById(projectId);
        if (!project) {
          sendJson(res, 404, { error: 'Proyecto no encontrado.' });
          return true;
        }
        const targetDirectory = String(
          body.targetDirectory ||
            project.localTargetPath ||
            path.join(process.cwd(), '.data', 'exports', project.id)
        );
        const overwriteManualEdits = Boolean(body.overwriteManualEdits);
        const resLocal = applyArtifactsToLocalDirectory({
          project,
          targetDirectory,
          overwriteManualEdits,
        });
        saveProject(project);
        sendJson(res, 200, { ...resLocal, project });
        return true;
      }

      if (subRoute === 'export/github' && method === 'POST') {
        const body = await readJsonBody(req);
        const project = getProjectById(projectId);
        if (!project) {
          sendJson(res, 404, { error: 'Proyecto no encontrado.' });
          return true;
        }
        const targetDirectory = typeof body.targetDirectory === 'string' ? body.targetDirectory : undefined;
        const branchName = typeof body.branchName === 'string' ? body.branchName : undefined;
        const expectedBaseCommit =
          typeof body.expectedBaseCommit === 'string' ? body.expectedBaseCommit : undefined;
        const syncResult = prepareGitHubBranchDelivery({
          project,
          targetDirectory,
          branchName,
          expectedBaseCommit,
        });
        saveProject(project);
        sendJson(res, 200, { syncResult, project });
        return true;
      }

      if (subRoute === 'export/bundle' && method === 'GET') {
        const project = getProjectById(projectId);
        if (!project) {
          sendJson(res, 404, { error: 'Proyecto no encontrado.' });
          return true;
        }
        const bundle = {
          exportedAt: new Date().toISOString(),
          generator: 'Forja — Optimizador y Organizador de Proyectos',
          projectId: project.id,
          projectName: project.name,
          briefRevision: project.brief.revision,
          artifacts: project.generatedArtifacts,
          agentRoles: project.agentRoles,
          tasks: project.tasks,
          environmentPlans: project.environmentPlans,
        };
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="forja-paquete-${project.id}-rev${project.brief.revision}.json"`,
        });
        res.end(JSON.stringify(bundle, null, 2));
        return true;
      }
    }

    sendJson(res, 404, { error: `Ruta API no encontrada: ${method} ${pathname}` });
    return true;
  } catch (err) {
    sendJson(res, 500, {
      error: err instanceof Error ? err.message : String(err),
    });
    return true;
  }
}
