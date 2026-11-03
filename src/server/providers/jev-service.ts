import { TypeSafeClient, choice, noul } from '@typesafe-ai/sdk';
import { resolveSecret } from '../config/secrets.js';
import { saveJevEvaluation } from '../storage/db.js';
import {
  JEV_EVALUATION_VERSION,
  DEFAULT_JEV_MODEL,
  JEV_THRESHOLDS,
  buildBriefClarityQuestions,
  buildSkillSuggestionPass1Questions,
  buildSkillSuggestionPass2Questions,
  buildMcpFitQuestions,
  buildStackCompositeQuestions,
  buildTaskRoleRoutingQuestions,
  buildEvidenceAuditQuestions,
} from './jev-questions.js';
import type {
  JevEvaluationRecord,
  JevAnswerSummary,
  JevUseCase,
  CatalogEntry,
  ProjectBrief,
  EvidenceItem,
  DimensionWeights,
  StackDimensionKey,
} from '../../shared/types.js';

const TYPESAFE_BASE_URL = process.env.TYPESAFE_ENDPOINT || 'https://api.typesafe.ai';

export interface TypeSafeModelInfo {
  name: string;
  description: string;
  releaseDate: string;
}

function classifyErrorStatus(err: unknown): {
  status: JevEvaluationRecord['status'];
  message: string;
} {
  const msg = err instanceof Error ? err.message : String(err);
  const statusMatch = msg.match(/\b(401|403|429|400|422|500|502|503)\b/);
  const statusCode = statusMatch ? Number(statusMatch[1]) : (err as { status?: number })?.status;

  if (statusCode === 401 || statusCode === 403 || /unauthorized|forbidden|api key|authentication/i.test(msg)) {
    return {
      status: 'auth_error',
      message: `Error de autenticación en TypeSafe (HTTP ${statusCode ?? 401}): verificá que TYPESAFE_API_KEY sea válida.`,
    };
  }
  if (statusCode === 429 || /rate limit|quota|too many requests/i.test(msg)) {
    return {
      status: 'quota_error',
      message: `Límite de cuota o tasa alcanzado en TypeSafe (HTTP 429): reintentá en unos segundos o revisá el consumo de tu cuenta.`,
    };
  }
  if (statusCode === 400 || statusCode === 422 || /validation/i.test(msg)) {
    return {
      status: 'validation_error',
      message: `Error de validación de contrato en TypeSafe (HTTP ${statusCode ?? 422}): ${msg}`,
    };
  }
  return {
    status: 'network_error',
    message: `Error de red o servicio al contactar TypeSafe: ${msg}`,
  };
}

function normalizeAnswers(rawAnswers: Record<string, unknown>): Record<string, JevAnswerSummary> {
  const out: Record<string, JevAnswerSummary> = {};
  for (const [key, ans] of Object.entries(rawAnswers)) {
    const a = ans as Record<string, unknown>;
    const type = a.type as 'noul' | 'choice' | 'score';
    if (type === 'noul') {
      const p = Number(a.noul ?? 0);
      const distanceFromHalf = Math.abs(2 * p - 1);
      out[key] = {
        questionKey: key,
        type: 'noul',
        value: Number(p.toFixed(4)),
        // Noul NO devuelve campo `confidence` propio en el contrato de TypeSafe;
        // documentamos explícitamente la probabilidad p y su distancia a 0.5 sin mostrarlo como % de acierto garantizado.
        interpretationNote: `Probabilidad Noul p=${p.toFixed(3)} (distancia a incertidumbre 0.5: ${distanceFromHalf.toFixed(2)}; no incluye campo confidence nativo).`,
      };
    } else if (type === 'choice') {
      const conf = Number(a.confidence ?? 0);
      out[key] = {
        questionKey: key,
        type: 'choice',
        value: String(a.choice ?? ''),
        confidence: Number(conf.toFixed(4)),
        probabilities: (a.probabilities as Record<string, number>) ?? {},
        interpretationNote: `Opción seleccionada '${a.choice}' (concentración de distribución confidence=${conf.toFixed(2)}; no equivale a porcentaje garantizado de acierto).`,
      };
    } else if (type === 'score') {
      const s = Number(a.score ?? 0);
      const conf = Number(a.confidence ?? 0);
      out[key] = {
        questionKey: key,
        type: 'score',
        value: Number(s.toFixed(4)),
        confidence: Number(conf.toFixed(4)),
        probabilities: (a.probabilities as Record<string, number>) ?? {},
        legend: (a.legend as Record<string, unknown>) ?? {},
        interpretationNote: `Puntaje esperado=${s.toFixed(2)} (concentración de distribución confidence=${conf.toFixed(2)}; no equivale a porcentaje garantizado de acierto).`,
      };
    }
  }
  return out;
}

/**
 * Descubre los modelos disponibles en `GET https://api.typesafe.ai/v1/models`
 * y realiza una prueba real de conexión con `POST https://api.typesafe.ai/v1/systemone`.
 */
export async function probeTypeSafeConnection(overrideApiKey?: string): Promise<{
  ok: boolean;
  models: TypeSafeModelInfo[];
  probeEvaluation: JevEvaluationRecord;
}> {
  const secret = overrideApiKey
    ? { value: overrideApiKey.trim(), sourceScope: 'local_secret_store' as const }
    : resolveSecret('TYPESAFE_API_KEY');

  const evalId = `jev_probe_${Date.now()}`;
  const startedAt = Date.now();

  if (!secret.value) {
    const failedRecord: JevEvaluationRecord = {
      id: evalId,
      useCase: 'connection_probe',
      evaluationVersion: JEV_EVALUATION_VERSION,
      modelRequested: DEFAULT_JEV_MODEL,
      modelUsed: 'none',
      criteriaSummary: { probe: 'GET /v1/models + POST /v1/systemone' },
      answers: {},
      usage: { inputTokens: 0, outputTokens: 0 },
      latencyMs: 0,
      status: 'auth_error',
      errorMessage: 'TYPESAFE_API_KEY no está configurada en el entorno ni en el almacén local.',
      createdAt: new Date().toISOString(),
    };
    saveJevEvaluation(failedRecord);
    return { ok: false, models: [], probeEvaluation: failedRecord };
  }

  try {
    // 1. GET https://api.typesafe.ai/v1/models
    const modelsRes = await fetch(`${TYPESAFE_BASE_URL}/v1/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secret.value}`,
        Accept: 'application/json',
      },
    });

    if (!modelsRes.ok) {
      throw new Error(`GET /v1/models devolvió HTTP ${modelsRes.status}`);
    }

    const modelsJson = (await modelsRes.json()) as {
      models?: Array<{ name: string; description: string; release_date: string }>;
    };
    const models: TypeSafeModelInfo[] = (modelsJson.models ?? []).map((m) => ({
      name: m.name,
      description: m.description,
      releaseDate: m.release_date,
    }));

    const selectedModel = models.find((m) => m.name === DEFAULT_JEV_MODEL)?.name || models[0]?.name || DEFAULT_JEV_MODEL;

    // 2. POST https://api.typesafe.ai/v1/systemone via SDK oficial @typesafe-ai/sdk
    const client = new TypeSafeClient({
      apiKey: secret.value,
      baseURL: TYPESAFE_BASE_URL,
    });

    const response = await client.systemOne({
      model: selectedModel,
      state: {
        probe: 'Verificación de contrato System One desde Optimizador de Proyectos.',
        target: 'Preparar un proyecto de software con investigación, comparación de stack y agentes.',
      },
      questions: {
        is_software_project_request: noul(
          'Does `target` describe preparing a software engineering project?'
        ),
        primary_focus: choice('What is the primary focus described in `target`?', {
          project_preparation: 'Defining, researching, and preparing a software project',
          unrelated_chat: 'Casual conversation unrelated to software',
        }),
      },
    });

    const record: JevEvaluationRecord = {
      id: evalId,
      useCase: 'connection_probe',
      evaluationVersion: JEV_EVALUATION_VERSION,
      modelRequested: selectedModel,
      modelUsed: response.model || selectedModel,
      criteriaSummary: {
        modelsDiscoveredCount: models.length,
        questionsAsked: ['is_software_project_request (noul)', 'primary_focus (choice)'],
      },
      answers: normalizeAnswers(response.answers as unknown as Record<string, unknown>),
      usage: {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      },
      latencyMs: Date.now() - startedAt,
      status: 'success',
      createdAt: new Date().toISOString(),
    };

    saveJevEvaluation(record);
    return { ok: true, models, probeEvaluation: record };
  } catch (err) {
    const classified = classifyErrorStatus(err);
    const failedRecord: JevEvaluationRecord = {
      id: evalId,
      useCase: 'connection_probe',
      evaluationVersion: JEV_EVALUATION_VERSION,
      modelRequested: DEFAULT_JEV_MODEL,
      modelUsed: 'none',
      criteriaSummary: { probe: 'GET /v1/models + POST /v1/systemone' },
      answers: {},
      usage: { inputTokens: 0, outputTokens: 0 },
      latencyMs: Date.now() - startedAt,
      status: classified.status,
      errorMessage: classified.message,
      createdAt: new Date().toISOString(),
    };
    saveJevEvaluation(failedRecord);
    return { ok: false, models: [], probeEvaluation: failedRecord };
  }
}

/**
 * Ejecutor genérico validado contra POST /v1/systemone usando @typesafe-ai/sdk.
 * Registra criterios, versión, modelo utilizado, respuestas y consumo sin guardar credenciales.
 */
export async function executeJevSystemOne(params: {
  projectId?: string;
  useCase: JevUseCase;
  state: Record<string, unknown> | string;
  questions: Record<string, unknown>;
  criteriaSummary: Record<string, unknown>;
  chainedStep?: number;
  parentEvaluationId?: string;
}): Promise<JevEvaluationRecord> {
  const evalId = `jev_${params.useCase}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const startedAt = Date.now();
  const secret = resolveSecret('TYPESAFE_API_KEY');

  if (!secret.value) {
    const noKeyRecord: JevEvaluationRecord = {
      id: evalId,
      projectId: params.projectId,
      useCase: params.useCase,
      evaluationVersion: JEV_EVALUATION_VERSION,
      modelRequested: DEFAULT_JEV_MODEL,
      modelUsed: 'none',
      chainedStep: params.chainedStep,
      parentEvaluationId: params.parentEvaluationId,
      criteriaSummary: params.criteriaSummary,
      answers: {},
      usage: { inputTokens: 0, outputTokens: 0 },
      latencyMs: 0,
      status: 'auth_error',
      errorMessage:
        'TYPESAFE_API_KEY no configurada. Configurá la clave en Conexiones para ejecutar evaluaciones reales con Jev.',
      createdAt: new Date().toISOString(),
    };
    saveJevEvaluation(noKeyRecord);
    return noKeyRecord;
  }

  try {
    const client = new TypeSafeClient({
      apiKey: secret.value,
      baseURL: TYPESAFE_BASE_URL,
    });

    const response = await client.systemOne({
      model: process.env.TYPESAFE_MODEL || DEFAULT_JEV_MODEL,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      state: params.state as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      questions: params.questions as any,
    });

    const record: JevEvaluationRecord = {
      id: evalId,
      projectId: params.projectId,
      useCase: params.useCase,
      evaluationVersion: JEV_EVALUATION_VERSION,
      modelRequested: process.env.TYPESAFE_MODEL || DEFAULT_JEV_MODEL,
      modelUsed: response.model || DEFAULT_JEV_MODEL,
      chainedStep: params.chainedStep,
      parentEvaluationId: params.parentEvaluationId,
      criteriaSummary: params.criteriaSummary,
      answers: normalizeAnswers(response.answers as unknown as Record<string, unknown>),
      usage: {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      },
      latencyMs: Date.now() - startedAt,
      status: 'success',
      createdAt: new Date().toISOString(),
    };

    saveJevEvaluation(record);
    return record;
  } catch (err) {
    const classified = classifyErrorStatus(err);
    const failedRecord: JevEvaluationRecord = {
      id: evalId,
      projectId: params.projectId,
      useCase: params.useCase,
      evaluationVersion: JEV_EVALUATION_VERSION,
      modelRequested: process.env.TYPESAFE_MODEL || DEFAULT_JEV_MODEL,
      modelUsed: 'none',
      chainedStep: params.chainedStep,
      parentEvaluationId: params.parentEvaluationId,
      criteriaSummary: params.criteriaSummary,
      answers: {},
      usage: { inputTokens: 0, outputTokens: 0 },
      latencyMs: Date.now() - startedAt,
      status: classified.status,
      errorMessage: classified.message,
      createdAt: new Date().toISOString(),
    };
    saveJevEvaluation(failedRecord);
    return failedRecord;
  }
}

// ============================================================================
// Casos de Uso Funcionales de Jev
// ============================================================================

/**
 * 1. Evalúa qué aspectos de la entrada están claramente definidos y cuáles requieren aclaración.
 */
export async function evaluateBriefClarityWithJev(
  projectId: string,
  inputRaw: string,
  mode: string
): Promise<{
  evaluation: JevEvaluationRecord;
  definedAspects: string[];
  needsClarificationAspects: string[];
  detectedArchetype: string;
  hasContradictionSignal: boolean;
}> {
  const questions = buildBriefClarityQuestions();
  const evalRecord = await executeJevSystemOne({
    projectId,
    useCase: 'brief_clarity',
    state: {
      input: {
        text: inputRaw,
        mode,
      },
    },
    questions,
    criteriaSummary: {
      thresholds: {
        definedHigh: JEV_THRESHOLDS.NOUL_DEFINED_HIGH,
        missingLow: JEV_THRESHOLDS.NOUL_MISSING_LOW,
      },
      aspectsEvaluated: [
        'has_concrete_objective',
        'has_target_users',
        'has_technical_constraints',
        'has_acceptance_scope',
        'has_internal_contradictions',
        'project_archetype',
      ],
    },
    chainedStep: 1,
  });

  const definedAspects: string[] = [];
  const needsClarificationAspects: string[] = [];

  if (evalRecord.status === 'success') {
    const aspectMap: Record<string, string> = {
      has_concrete_objective: 'Objetivo funcional concreto',
      has_target_users: 'Usuarios destinatarios y contexto de uso',
      has_technical_constraints: 'Restricciones técnicas, de SO o presupuesto',
      has_acceptance_scope: 'Límites del alcance inicial (MVP)',
    };

    for (const [key, label] of Object.entries(aspectMap)) {
      const p = Number(evalRecord.answers[key]?.value ?? 0.5);
      if (p >= JEV_THRESHOLDS.NOUL_DEFINED_HIGH) {
        definedAspects.push(`${label} (Noul p=${p.toFixed(2)})`);
      } else {
        needsClarificationAspects.push(`${label} (Noul p=${p.toFixed(2)} < ${JEV_THRESHOLDS.NOUL_DEFINED_HIGH})`);
      }
    }
  }

  const detectedArchetype = String(evalRecord.answers['project_archetype']?.value || 'local_web_tool');
  const contradictionP = Number(evalRecord.answers['has_internal_contradictions']?.value ?? 0);
  const hasContradictionSignal = contradictionP >= JEV_THRESHOLDS.CONTRADICTION_ALERT_NOUL;

  evalRecord.compositeResult = {
    definedAspects,
    needsClarificationAspects,
    detectedArchetype,
    hasContradictionSignal,
  };
  saveJevEvaluation(evalRecord);

  return {
    evaluation: evalRecord,
    definedAspects,
    needsClarificationAspects,
    detectedArchetype,
    hasContradictionSignal,
  };
}

/**
 * 2. Selección progresiva de Skills siguiendo el Cookbook oficial `skill_suggestion` de TypeSafe:
 *    - Pasada 1: Rankea todo el catálogo de skills + evalúa las 3 preguntas de acción (`gate`) y `named`.
 *    - Pasada 2 (encadenada): Toma el Top 3 (`SHORTLIST = 3`), incluye descripción completa + extracto de SKILL.md,
 *      y evalúa `Choice` (`which`) + un `Noul` `fits::<name>` por candidato, admitiendo que ninguno sirva.
 */
export async function suggestSkillsWithJevCookbook(
  projectId: string,
  brief: ProjectBrief,
  skillsRoster: CatalogEntry[]
): Promise<{
  pass1Record: JevEvaluationRecord;
  pass2Record?: JevEvaluationRecord;
  gatePassed: boolean;
  actionGateScore: number;
  namedScore: number;
  shortlistNames: string[];
  winnerSkillName: string | null;
  fittingSkills: Array<{ name: string; fitProbability: number }>;
}> {
  const state = {
    project: {
      title: brief.title,
      objective: brief.objective,
      problem: brief.problemStatement,
      features: brief.coreFeatures,
      constraints: brief.constraints,
    },
  };

  // Pasada 1: Skim every skill in roster
  const pass1Questions = buildSkillSuggestionPass1Questions(skillsRoster);
  const pass1Record = await executeJevSystemOne({
    projectId,
    useCase: 'skill_suggestion',
    state,
    questions: pass1Questions,
    criteriaSummary: {
      cookbookStep: 'Pass 1: rank_wide + action gate + named gate',
      rosterSize: skillsRoster.length,
      thresholds: {
        actionGate: JEV_THRESHOLDS.SKILL_ACTION_GATE_THRESHOLD,
        namedGate: JEV_THRESHOLDS.SKILL_NAMED_GATE_THRESHOLD,
      },
    },
    chainedStep: 1,
  });

  if (pass1Record.status !== 'success') {
    return {
      pass1Record,
      gatePassed: false,
      actionGateScore: 0,
      namedScore: 0,
      shortlistNames: [],
      winnerSkillName: null,
      fittingSkills: [],
    };
  }

  const pActs = Number(pass1Record.answers['gate::acts_on_user_system']?.value ?? 0);
  const pProc = Number(pass1Record.answers['gate::would_follow_documented_procedure']?.value ?? 0);
  const pProse = Number(pass1Record.answers['gate::prose_suffices']?.value ?? 0);
  // Invertimos prose_suffices igual que en el cookbook oficial (`INVERTED = {"prose_suffices"}`)
  const actionGateScore = (pActs + pProc + (1.0 - pProse)) / 3;
  const namedScore = Number(pass1Record.answers['named']?.value ?? 0);

  const gatePassed =
    actionGateScore >= JEV_THRESHOLDS.SKILL_ACTION_GATE_THRESHOLD ||
    namedScore >= JEV_THRESHOLDS.SKILL_NAMED_GATE_THRESHOLD;

  const probs = pass1Record.answers['which']?.probabilities ?? {};
  const rankedNames = Object.entries(probs)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);

  const shortlistNames = rankedNames.slice(0, JEV_THRESHOLDS.SKILL_SHORTLIST_SIZE);

  pass1Record.compositeResult = {
    actionGateScore: Number(actionGateScore.toFixed(3)),
    namedScore: Number(namedScore.toFixed(3)),
    gatePassed,
    shortlistNames,
  };
  saveJevEvaluation(pass1Record);

  if (!gatePassed || shortlistNames.length === 0) {
    return {
      pass1Record,
      gatePassed: false,
      actionGateScore,
      namedScore,
      shortlistNames,
      winnerSkillName: null,
      fittingSkills: [],
    };
  }

  // Pasada 2 Encadenada: Re-leer el Top 3 con descripción completa y cuerpo de SKILL.md
  const shortlistEntries = shortlistNames
    .map((name) => skillsRoster.find((s) => s.name === name))
    .filter((s): s is CatalogEntry => Boolean(s));

  const pass2Questions = buildSkillSuggestionPass2Questions(shortlistEntries);
  const pass2Record = await executeJevSystemOne({
    projectId,
    useCase: 'skill_suggestion',
    state,
    questions: pass2Questions,
    criteriaSummary: {
      cookbookStep: 'Pass 2: rerank top 3 with full description & SKILL.md excerpt + fits::<name> nouls',
      shortlist: shortlistNames,
      fitsThreshold: JEV_THRESHOLDS.SKILL_FITS_THRESHOLD,
    },
    chainedStep: 2,
    parentEvaluationId: pass1Record.id,
  });

  if (pass2Record.status !== 'success') {
    return {
      pass1Record,
      pass2Record,
      gatePassed,
      actionGateScore,
      namedScore,
      shortlistNames,
      winnerSkillName: null,
      fittingSkills: [],
    };
  }

  const fittingSkills: Array<{ name: string; fitProbability: number }> = [];
  for (const name of shortlistNames) {
    const pFit = Number(pass2Record.answers[`fits::${name}`]?.value ?? 0);
    fittingSkills.push({ name, fitProbability: pFit });
  }
  fittingSkills.sort((a, b) => b.fitProbability - a.fitProbability);

  const bestFit = fittingSkills[0]?.fitProbability ?? 0;
  const rawWinner = String(pass2Record.answers['which']?.value || '');
  // Si ningún candidato supera FITS_THRESHOLD, admitimos explícitamente que ninguno sirve
  const winnerSkillName = bestFit >= JEV_THRESHOLDS.SKILL_FITS_THRESHOLD ? rawWinner : null;

  pass2Record.compositeResult = {
    rawChoiceWinner: rawWinner,
    fittingSkills,
    bestFitProbability: bestFit,
    verdictWinner: winnerSkillName ?? 'nothing_fits',
  };
  saveJevEvaluation(pass2Record);

  return {
    pass1Record,
    pass2Record,
    gatePassed,
    actionGateScore,
    namedScore,
    shortlistNames,
    winnerSkillName,
    fittingSkills,
  };
}

/**
 * 3. Puntúa el ajuste de candidatos MCP/herramientas a los requisitos documentados del proyecto.
 */
export async function evaluateMcpFitWithJev(
  projectId: string,
  brief: ProjectBrief,
  mcpCandidates: CatalogEntry[]
): Promise<{
  evaluation: JevEvaluationRecord;
  scoresByCatalogId: Record<string, { score: number; confidence: number; solvesNeedProb: number }>;
}> {
  const questions = buildMcpFitQuestions(mcpCandidates);
  const evaluation = await executeJevSystemOne({
    projectId,
    useCase: 'mcp_fit',
    state: {
      project: {
        title: brief.title,
        objective: brief.objective,
        features: brief.coreFeatures,
        constraints: brief.constraints,
      },
    },
    questions,
    criteriaSummary: {
      candidatesEvaluated: mcpCandidates.map((c) => c.id),
      thresholds: {
        minNoul: JEV_THRESHOLDS.MCP_FIT_MIN_NOUL,
        necessaryScore: JEV_THRESHOLDS.MCP_NECESSARY_SCORE,
        recommendedScore: JEV_THRESHOLDS.MCP_RECOMMENDED_SCORE,
      },
    },
  });

  const scoresByCatalogId: Record<string, { score: number; confidence: number; solvesNeedProb: number }> = {};
  if (evaluation.status === 'success') {
    for (const mcp of mcpCandidates) {
      const safeKey = mcp.id.replace(/[^a-zA-Z0-9_-]/g, '_');
      const scoreAns = evaluation.answers[`fit_score::${safeKey}`];
      const noulAns = evaluation.answers[`solves_need::${safeKey}`];
      scoresByCatalogId[mcp.id] = {
        score: Number(scoreAns?.value ?? 0),
        confidence: Number(scoreAns?.confidence ?? 0),
        solvesNeedProb: Number(noulAns?.value ?? 0),
      };
    }
    evaluation.compositeResult = scoresByCatalogId;
    saveJevEvaluation(evaluation);
  }

  return { evaluation, scoresByCatalogId };
}

/**
 * 4. Evalúa dimensiones específicas de alternativas técnicas siguiendo el patrón oficial `Composite scoring`:
 *    - Preguntas `Score` atómicas (niveles 0..3) por dimensión y alternativa.
 *    - Normalización a 0..1 (`score / 3`) y combinación con pesos explícitos en código.
 */
export async function evaluateStackDimensionsWithJev(
  projectId: string,
  brief: ProjectBrief,
  options: Array<{ id: string; name: string; summary: string }>,
  weights: DimensionWeights
): Promise<{
  evaluation: JevEvaluationRecord;
  dimensionScores: Record<
    string,
    Record<StackDimensionKey, { rawScore: number; normalized: number; confidence: number }>
  >;
  compositeScores: Record<string, number>;
}> {
  let allQuestions: Record<string, unknown> = {};
  for (const opt of options) {
    allQuestions = {
      ...allQuestions,
      ...buildStackCompositeQuestions(opt.id, opt.name, opt.summary),
    };
  }

  const evaluation = await executeJevSystemOne({
    projectId,
    useCase: 'stack_dimensions',
    state: {
      project: {
        title: brief.title,
        objective: brief.objective,
        targetUsers: brief.targetUsers,
        coreFeatures: brief.coreFeatures,
        constraints: brief.constraints,
      },
    },
    questions: allQuestions,
    criteriaSummary: {
      pattern: 'Composite scoring (docs.typesafe.ai/patterns/composite-scoring)',
      options: options.map((o) => o.id),
      weights,
    },
  });

  const dimensionKeys: StackDimensionKey[] = [
    'functionalFit',
    'buildTime',
    'operations',
    'cost',
    'experience',
    'integrations',
    'evolution',
  ];

  const dimensionScores: Record<
    string,
    Record<StackDimensionKey, { rawScore: number; normalized: number; confidence: number }>
  > = {};
  const compositeScores: Record<string, number> = {};

  if (evaluation.status === 'success') {
    const totalWeight = Object.values(weights).reduce((acc, v) => acc + v, 0) || 1;
    for (const opt of options) {
      dimensionScores[opt.id] = {} as Record<
        StackDimensionKey,
        { rawScore: number; normalized: number; confidence: number }
      >;
      let weightedSum = 0;
      for (const dim of dimensionKeys) {
        const ans = evaluation.answers[`${opt.id}::${dim}`];
        const raw = Number(ans?.value ?? 2.0);
        const norm = Math.max(0, Math.min(1, raw / 3)); // 4 niveles: 0, 1, 2, 3 -> normalizado 0..1
        const conf = Number(ans?.confidence ?? 0.5);
        dimensionScores[opt.id][dim] = {
          rawScore: Number(raw.toFixed(2)),
          normalized: Number(norm.toFixed(3)),
          confidence: Number(conf.toFixed(2)),
        };
        weightedSum += norm * (weights[dim] / totalWeight);
      }
      compositeScores[opt.id] = Number((weightedSum * 100).toFixed(1));
    }

    evaluation.compositeResult = {
      weightsApplied: weights,
      compositeScores,
    };
    saveJevEvaluation(evaluation);
  }

  return { evaluation, dimensionScores, compositeScores };
}

/**
 * 5. Clasifica tareas para asignarlas a roles de agentes especializados.
 */
export async function classifyTasksWithJev(
  projectId: string,
  brief: ProjectBrief,
  tasks: Array<{ id: string; title: string; description: string }>,
  roles: Array<{ id: string; title: string; objective: string }>
): Promise<{
  evaluation: JevEvaluationRecord;
  assignments: Record<string, { roleId: string; confidence: number; needsSequentialIsolation: boolean }>;
}> {
  const roleCriteria: Record<string, string> = {};
  for (const r of roles) {
    roleCriteria[r.id] = `${r.title}: ${r.objective}`;
  }

  const questions = buildTaskRoleRoutingQuestions(tasks, roleCriteria);
  const evaluation = await executeJevSystemOne({
    projectId,
    useCase: 'task_role_routing',
    state: {
      projectTitle: brief.title,
      tasks,
    },
    questions,
    criteriaSummary: {
      tasksCount: tasks.length,
      availableRoles: roles.map((r) => r.id),
    },
  });

  const assignments: Record<string, { roleId: string; confidence: number; needsSequentialIsolation: boolean }> = {};
  if (evaluation.status === 'success') {
    for (const t of tasks) {
      const roleAns = evaluation.answers[`role::${t.id}`];
      const isoAns = evaluation.answers[`needs_isolation::${t.id}`];
      assignments[t.id] = {
        roleId: String(roleAns?.value || roles[0]?.id || 'architecture'),
        confidence: Number(roleAns?.confidence ?? 0.5),
        needsSequentialIsolation: Number(isoAns?.value ?? 0.5) >= 0.55,
      };
    }
    evaluation.compositeResult = assignments;
    saveJevEvaluation(evaluation);
  }

  return { evaluation, assignments };
}

/**
 * 6. Detecta evidencia insuficiente o contradicciones relevantes tras una corrida de investigación.
 */
export async function auditEvidenceWithJev(
  projectId: string,
  brief: ProjectBrief,
  evidenceItems: EvidenceItem[]
): Promise<{
  evaluation: JevEvaluationRecord;
  hasPrimarySources: boolean;
  hasContradictions: boolean;
  sufficiencyScore: number;
}> {
  const questions = buildEvidenceAuditQuestions();
  const evaluation = await executeJevSystemOne({
    projectId,
    useCase: 'evidence_contradiction_check',
    state: {
      brief: {
        objective: brief.objective,
        constraints: brief.constraints,
      },
      evidence: evidenceItems.slice(0, 12).map((e) => ({
        title: e.title,
        sourceType: e.sourceType,
        category: e.category,
        summary: e.summary,
        contradictionsOrUncertainties: e.contradictionsOrUncertainties,
      })),
    },
    questions,
    criteriaSummary: {
      evidenceCount: evidenceItems.length,
    },
  });

  const pPrimary = Number(evaluation.answers['has_primary_sources']?.value ?? 0.8);
  const pContra = Number(evaluation.answers['has_unresolved_contradictions']?.value ?? 0.2);
  const suffScore = Number(evaluation.answers['evidence_sufficiency']?.value ?? 2.0);

  return {
    evaluation,
    hasPrimarySources: pPrimary >= 0.5,
    hasContradictions: pContra >= JEV_THRESHOLDS.CONTRADICTION_ALERT_NOUL,
    sufficiencyScore: suffScore,
  };
}
