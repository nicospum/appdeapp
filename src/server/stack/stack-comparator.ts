import { evaluateStackDimensionsWithJev } from '../providers/jev-service.js';
import { STACK_DIMENSION_LABELS } from '../providers/jev-questions.js';
import type {
  ProjectBrief,
  ExistingProjectInspection,
  StackComparison,
  StackOption,
  StackDimensionKey,
  PriorityPresetId,
  DimensionWeights,
  HardConstraintCheck,
} from '../../shared/types.js';

export const PRIORITY_PRESETS: Record<PriorityPresetId, { label: string; weights: DimensionWeights }> = {
  balanced: {
    label: 'Equilibrado (Recomendado)',
    weights: {
      functionalFit: 22,
      buildTime: 15,
      operations: 16,
      cost: 14,
      experience: 13,
      integrations: 12,
      evolution: 8,
    },
  },
  speed: {
    label: 'Rapidez de construcción',
    weights: {
      functionalFit: 18,
      buildTime: 35,
      operations: 14,
      cost: 10,
      experience: 10,
      integrations: 8,
      evolution: 5,
    },
  },
  low_cost: {
    label: 'Mínimo costo operativo',
    weights: {
      functionalFit: 18,
      buildTime: 12,
      operations: 15,
      cost: 35,
      experience: 7,
      integrations: 8,
      evolution: 5,
    },
  },
  local_first: {
    label: 'Funcionamiento local en PC',
    weights: {
      functionalFit: 18,
      buildTime: 12,
      operations: 32,
      cost: 15,
      experience: 8,
      integrations: 10,
      evolution: 5,
    },
  },
  privacy: {
    label: 'Privacidad y control de datos',
    weights: {
      functionalFit: 18,
      buildTime: 8,
      operations: 26,
      cost: 12,
      experience: 8,
      integrations: 14,
      evolution: 14,
    },
  },
  design_ux: {
    label: 'Diseño, UX e interactividad',
    weights: {
      functionalFit: 20,
      buildTime: 10,
      operations: 10,
      cost: 8,
      experience: 34,
      integrations: 10,
      evolution: 8,
    },
  },
  maintainability: {
    label: 'Facilidad de mantenimiento y evolución',
    weights: {
      functionalFit: 18,
      buildTime: 10,
      operations: 22,
      cost: 10,
      experience: 8,
      integrations: 10,
      evolution: 22,
    },
  },
};

/**
 * Evalúa restricciones duras y comprobables en código antes de puntuar compromisos.
 * Una opción que incumple sistema operativo, presupuesto o tecnologías prohibidas queda descalificada
 * y NUNCA puede ganar aunque tenga buena puntuación general.
 */
function evaluateHardConstraints(
  brief: ProjectBrief,
  optionMeta: {
    supportedOs: string[];
    requiresPaidEnterprise: boolean;
    requiresCloudOnly: boolean;
    techTokens: string[];
  }
): { checks: HardConstraintCheck[]; disqualified: boolean; reason?: string } {
  const checks: HardConstraintCheck[] = [];
  const targetOsLower = brief.constraints.targetOs.toLowerCase();

  // 1. Compatibilidad de Sistema Operativo
  const needsWindows = targetOsLower.includes('win');
  const needsMacOnly = optionMeta.supportedOs.length === 1 && optionMeta.supportedOs[0] === 'darwin';
  const osPassed = !(needsWindows && needsMacOnly);
  checks.push({
    constraintName: `Sistema operativo (${brief.constraints.targetOs})`,
    passed: osPassed,
    reason: osPassed
      ? `Compatible nativamente con ${brief.constraints.targetOs}.`
      : `Incompatible: requiere macOS exclusivo y el objetivo exige ${brief.constraints.targetOs}.`,
  });

  // 2. Presupuesto / Infraestructura personal vs empresarial
  const isStrictZeroBudget =
    /(\$0|gratis|free|sin costo|personal|bajo)/i.test(brief.constraints.budgetLimit) &&
    optionMeta.requiresPaidEnterprise;
  const budgetPassed = !isStrictZeroBudget;
  checks.push({
    constraintName: `Presupuesto (${brief.constraints.budgetLimit})`,
    passed: budgetPassed,
    reason: budgetPassed
      ? 'Se ajusta al presupuesto personal sin exigir licencias empresariales.'
      : `Excede el presupuesto declarado (${brief.constraints.budgetLimit}) al requerir servicios pagos obligatorios.`,
  });

  // 3. Modo de ejecución local / privacidad
  const requiresLocal = brief.constraints.executionMode === 'local_only' || brief.constraints.privacyLevel === 'strict_local';
  const execPassed = !(requiresLocal && optionMeta.requiresCloudOnly);
  checks.push({
    constraintName: `Modo de ejecución (${brief.constraints.executionMode})`,
    passed: execPassed,
    reason: execPassed
      ? 'Cumple con el requisito de ejecución local y control de datos.'
      : 'Incumple la restricción de ejecución local: depende obligatoriamente de un backend en la nube.',
  });

  // 4. Tecnologías prohibidas explícitamente por el usuario
  const forbiddenMatched = brief.constraints.forbiddenTechnologies.filter((f) =>
    optionMeta.techTokens.some((t) => t.toLowerCase().includes(f.toLowerCase()))
  );
  const forbiddenPassed = forbiddenMatched.length === 0;
  if (brief.constraints.forbiddenTechnologies.length > 0) {
    checks.push({
      constraintName: `Tecnologías excluidas (${brief.constraints.forbiddenTechnologies.join(', ')})`,
      passed: forbiddenPassed,
      reason: forbiddenPassed
        ? 'No utiliza ninguna tecnología excluida por el usuario.'
        : `Incluye tecnología excluida explícitamente: ${forbiddenMatched.join(', ')}.`,
    });
  }

  const failed = checks.filter((c) => !c.passed);
  return {
    checks,
    disqualified: failed.length > 0,
    reason: failed.length > 0 ? failed.map((f) => f.reason).join(' ') : undefined,
  };
}

/**
 * Construye las 3 alternativas sustantivas de stack para el proyecto del usuario,
 * aplica restricciones duras primero, consulta a Jev para evaluación por dimensiones
 * y calcula el puntaje compuesto con pesos explícitos en código.
 */
export async function generateStackComparison(
  projectId: string,
  brief: ProjectBrief,
  preset: PriorityPresetId = 'balanced',
  customWeights?: DimensionWeights,
  existingInspection?: ExistingProjectInspection
): Promise<StackComparison> {
  const weights = customWeights ?? PRIORITY_PRESETS[preset].weights;

  // Si estamos en modo "Agregar o mejorar una función" sobre un proyecto existente,
  // la primera opción preserva estrictamente el stack detectado del proyecto.
  const isExisting = Boolean(existingInspection && existingInspection.exists);
  const existingStackLabel =
    isExisting && existingInspection!.detectedStack.length > 0
      ? existingInspection!.detectedStack.join(' + ')
      : null;

  const baseCandidates = [
    {
      id: 'opt_local_web_node_sqlite',
      name: existingStackLabel
        ? `Conservar Stack Existente (${existingStackLabel})`
        : 'Web Local Full-Stack (Node.js 24 + TypeScript + React/Vite + node:sqlite)',
      tagline: existingStackLabel
        ? 'Cambio mínimo compatible respetando la arquitectura, convenciones y dependencias actuales del proyecto.'
        : 'Interfaz web local cuidada servida por un proceso Node.js/TypeScript con persistencia SQLite nativa sin compilación C++.',
      components: {
        frontend: existingStackLabel ? existingStackLabel : 'React 18 + Vite + CSS accesible por teclado',
        backend: 'Node.js 24 HTTP/REST + TypeScript (tsx) + Zod',
        storage: 'SQLite nativo (node:sqlite en modo WAL) + archivos Markdown/JSON',
        runtime: 'Node.js v24.x en Windows / multiplataforma',
        packaging: 'Ejecución directa con npm run dev / npm start',
      },
      meta: {
        supportedOs: ['win32', 'darwin', 'linux'],
        requiresPaidEnterprise: false,
        requiresCloudOnly: false,
        techTokens: ['node', 'typescript', 'react', 'vite', 'sqlite'],
      },
      costEstimate: {
        monthlyRangeUsd: '$0/mes base local + consumo medido de APIs opcionales ($0.50–$5/mes estimado)',
        isUnknownPrice: false,
        assumptions: [
          'Ejecución local en la PC del usuario ($0 en servidores y base de datos).',
          'Uso personal estimado: 50–200 evaluaciones Jev y 20 síntesis de proyectos al mes.',
          'Output tokens en TypeSafe System One gratuitos según contrato actual; solo se facturan input tokens.',
        ],
        requiredServices: ['Runtime local Node.js 24 (gratuito)', 'API key de TypeSafe / LLM según uso'],
        sourceUrl: 'https://docs.typesafe.ai/api/system-one',
        note: 'Sin costos fijos ni suscripciones empresariales obligatorias.',
      },
      whenToPreferThis:
        'Prioridad en simplicidad de instalación en Windows, acceso directo a archivos/clientes locales, costo fijo $0 y velocidad de iteración.',
      tradeoffs: [
        'Requiere tener Node.js instalado en la PC (ya presente v24.22.2).',
        'Se abre en una pestaña del navegador local en lugar de una ventana nativa independiente.',
      ],
      defaultScores: {
        functionalFit: 2.9,
        buildTime: 2.8,
        operations: 2.9,
        cost: 2.9,
        experience: 2.8,
        integrations: 2.9,
        evolution: 2.7,
      } as Record<StackDimensionKey, number>,
      explanations: {
        functionalFit: isExisting
          ? 'Se integra directamente sobre los módulos existentes sin reescribir la aplicación ni romper flujos.'
          : 'Cubre todos los requisitos de interfaz interactiva, acceso a disco local, ejecución de CLIs (git, rea) y persistencia.',
        buildTime:
          'Arranque inmediato sin toolchains pesados (Rust/C++) gracias a `node:sqlite` integrado en Node 24.',
        operations:
          'Un único comando local (`npm run dev`), respaldos atómicos en `.data/` y actualización estándar vía npm/git.',
        cost: 'Cero infraestructura paga; solo consumos puntuales de API bajo presupuesto controlado.',
        experience:
          'Permite tablas comparativas ricas, visor de diffs, edición en vivo y soporte completo de teclado.',
        integrations:
          'Integración nativa en el mismo lenguaje con `@typesafe-ai/sdk`, CLI/MCP de REA y archivos de Codex/Cursor/Claude.',
        evolution:
          'Datos en SQLite estándar y artefactos exportables en Markdown/JSON sin bloqueo de proveedor.',
      } as Record<StackDimensionKey, string>,
    },
    {
      id: 'opt_desktop_electron_tauri',
      name: 'Aplicación de Escritorio Empaquetada (Tauri v2 / Electron + React)',
      tagline: 'Ventana nativa instalable (.exe / .msi) con proceso principal y acceso al sistema operativo.',
      components: {
        frontend: 'React + TypeScript en WebView2 (Tauri) o Chromium embebido (Electron)',
        backend: 'Proceso principal Electron (Node) o Core en Rust (Tauri IPC)',
        storage: 'SQLite local en AppData',
        runtime: 'Ejecutable empaquetado para Windows x64',
        packaging: 'electron-builder / cargo tauri build',
      },
      meta: {
        supportedOs: ['win32', 'darwin', 'linux'],
        requiresPaidEnterprise: false,
        requiresCloudOnly: false,
        techTokens: ['electron', 'tauri', 'rust', 'react'],
      },
      costEstimate: {
        monthlyRangeUsd: '$0/mes en ejecución local (certificado Code Signing Windows opcional: ~$100–$300/año si se distribuye a terceros)',
        isUnknownPrice: false,
        assumptions: [
          'Uso personal local sin firma Authenticode comercial.',
          'Mayor consumo de disco local (~180 MB por bundle Electron o toolchain Rust/MSVC para Tauri).',
        ],
        requiredServices: ['Toolchain de compilación local (Rust/MSVC para Tauri o electron-builder)'],
        sourceUrl: 'https://v2.tauri.app/start/prerequisites/',
        note: 'Para uso personal es gratuito, pero distribuir binarios firmados en Windows tiene costo anual de certificado.',
      },
      whenToPreferThis:
        'Preferible si tu prioridad principal es tener un ícono en la bandeja del sistema (system tray), atajos globales del SO o distribuir un instalador `.exe` cerrado.',
      tradeoffs: [
        'Mayor tiempo de construcción inicial y depuración de IPC entre procesos.',
        'En modo "Agregar función" a un proyecto web existente implicaría cambiar el empaquetado sin necesidad.',
      ],
      defaultScores: {
        functionalFit: isExisting ? 1.5 : 2.5,
        buildTime: 1.6,
        operations: 2.1,
        cost: 2.5,
        experience: 2.7,
        integrations: 2.4,
        evolution: 2.1,
      } as Record<StackDimensionKey, number>,
      explanations: {
        functionalFit:
          'Cumple las funciones locales, aunque añade una capa de IPC innecesaria para una herramienta personal de desarrollo.',
        buildTime:
          'Empaquetar y depurar permisos de procesos hijos (`npx`, `git`, `rea`) dentro de un binario empaquetado lleva más tiempo.',
        operations:
          'Cada cambio de código requiere recompilar o recargar el contenedor de escritorio.',
        cost: 'Gratuito para uso propio, con costo adicional solo si se requiere certificado de firma en Windows.',
        experience: 'Sensación de ventana nativa independiente, similar a VS Code o Cursor.',
        integrations:
          'En Electron requiere cuidar los fuses y rutas de `PATH` al invocar CLIs externos; en Tauri requiere puentes Rust <-> Node.',
        evolution: 'Más acoplado al ciclo de versiones del empaquetador nativo.',
      } as Record<StackDimensionKey, string>,
    },
    {
      id: 'opt_cloud_web_plus_local_daemon',
      name: 'Web en la Nube (Next.js Serverless + DB gestionada) con Ejecutor/Daemon Local',
      tagline: 'Interfaz alojada en la nube conectada a una base remota y a un agente/daemon local para tocar archivos de la PC.',
      components: {
        frontend: 'Next.js App Router desplegado en nube',
        backend: 'Serverless Functions + Daemon local separado en la PC',
        storage: 'PostgreSQL gestionado en la nube',
        runtime: 'Híbrido (Nube + Agente local)',
        packaging: 'Despliegue CI/CD + instalador de daemon local',
      },
      meta: {
        supportedOs: ['win32', 'darwin', 'linux'],
        requiresPaidEnterprise: false,
        requiresCloudOnly: true,
        techTokens: ['nextjs', 'cloud', 'postgres', 'serverless'],
      },
      costEstimate: {
        monthlyRangeUsd: '$0–$20/mes (Plan Hobby gratuito con límites estrictos de timeout; Pro $20/mes + DB gestionada)',
        isUnknownPrice: true,
        assumptions: [
          'Las funciones serverless gratuitas suelen cortar ejecuciones largas de investigación a los 10–60 segundos.',
          'Precio de transferencia y almacenamiento de base de datos en la nube varía según proveedor (precio desconocido != gratis).',
        ],
        requiredServices: ['Hosting serverless', 'Base de datos PostgreSQL en la nube', 'Túnel o daemon local autenticado'],
        sourceUrl: 'https://vercel.com/pricing',
        note: 'Advertencia: exige mantener dos piezas (nube + daemon local) y expone metadatos del proyecto fuera de la PC.',
      },
      whenToPreferThis:
        'Preferible únicamente si tu prioridad principal es acceder a los briefs desde un teléfono móvil o compartir proyectos en tiempo real con un equipo distribuido.',
      tradeoffs: [
        'Incumple la restricción de ejecución 100% local (`local_only`) y añade complejidad de seguridad entre la nube y tu PC.',
        'Los trabajos largos de investigación profunda chocan con límites de timeout serverless si no se pagan colas o workers dedicados.',
      ],
      defaultScores: {
        functionalFit: 1.7,
        buildTime: 1.4,
        operations: 1.3,
        cost: 1.5,
        experience: 2.3,
        integrations: 1.5,
        evolution: 1.8,
      } as Record<StackDimensionKey, number>,
      explanations: {
        functionalFit:
          'Una app en la nube no puede leer ni escribir directamente `C:\\Users\\User\\.codex\\config.toml` ni ejecutar `rea` local sin instalar igualmente un daemon en la PC.',
        buildTime:
          'Duplica el trabajo: hay que construir la aplicación en la nube, el daemon local y la autenticación mutua.',
        operations:
          'Mayor fricción operativa: si el daemon local no está corriendo o cae internet, la preparación de entornos falla.',
        cost: 'Riesgo de costos recurrentes por cómputo prolongado y base de datos remota.',
        experience: 'Accesible desde cualquier dispositivo con URL pública.',
        integrations:
          'Las integraciones con herramientas locales (REA, Git local, carpetas de la PC) se vuelven indirectas y más frágiles.',
        evolution: 'Mayor dependencia de proveedores cloud.',
      } as Record<StackDimensionKey, string>,
    },
  ];

  // Evaluamos con Jev en vivo las dimensiones de las alternativas
  const jevStackEval = await evaluateStackDimensionsWithJev(
    projectId,
    brief,
    baseCandidates.map((c) => ({
      id: c.id,
      name: c.name,
      summary: `${c.tagline}. Componentes: ${c.components.frontend}, ${c.components.backend}, ${c.components.storage}.`,
    })),
    weights
  );

  const dimensionKeys: StackDimensionKey[] = [
    'functionalFit',
    'buildTime',
    'operations',
    'cost',
    'experience',
    'integrations',
    'evolution',
  ];

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0) || 1;

  const evaluatedOptions: StackOption[] = baseCandidates.map((cand) => {
    // 1. Primero aplicamos restricciones duras comprobables en código
    const hardCheck = evaluateHardConstraints(brief, cand.meta);

    // 2. Combinamos puntuaciones de Jev (o base calibrada si no hay red) con los pesos explícitos
    const jevDims = jevStackEval.dimensionScores[cand.id];
    const dimensions: Record<StackDimensionKey, StackOption['dimensions'][StackDimensionKey]> = {} as Record<
      StackDimensionKey,
      StackOption['dimensions'][StackDimensionKey]
    >;

    let weightedSum = 0;
    for (const dim of dimensionKeys) {
      // Combinamos la lectura contextual de Jev con la evidencia técnica verificada de la arquitectura
      const rawScore = jevDims?.[dim]
        ? Number(((jevDims[dim].rawScore + cand.defaultScores[dim]) / 2).toFixed(2))
        : cand.defaultScores[dim];
      const scoreNormalized = Number((rawScore / 3).toFixed(3));
      const confidence = jevDims?.[dim]?.confidence;

      dimensions[dim] = {
        dimension: dim,
        label: STACK_DIMENSION_LABELS[dim],
        scoreNormalized,
        rawScoreLevel: rawScore,
        confidence,
        explanation: cand.explanations[dim],
        evidenceUrls: [cand.costEstimate.sourceUrl, 'https://nodejs.org/api/sqlite.html'],
      };

      weightedSum += scoreNormalized * (weights[dim] / totalWeight);
    }

    const weightedScore = Number((weightedSum * 100).toFixed(1));

    return {
      id: cand.id,
      name: cand.name,
      tagline: cand.tagline,
      components: cand.components,
      hardConstraints: hardCheck.checks,
      disqualifiedByHardConstraint: hardCheck.disqualified,
      disqualificationReason: hardCheck.reason,
      dimensions,
      costEstimate: cand.costEstimate,
      weightedScore,
      whenToPreferThis: cand.whenToPreferThis,
      tradeoffs: cand.tradeoffs,
    };
  });

  // Ordenar: las opciones válidas (no descalificadas por restricciones duras) siempre van primero
  const validOptions = evaluatedOptions
    .filter((o) => !o.disqualifiedByHardConstraint)
    .sort((a, b) => b.weightedScore - a.weightedScore);

  const recommended = validOptions[0] ?? evaluatedOptions[0];
  const runnerUp = validOptions[1] ?? evaluatedOptions[1];

  return {
    briefRevision: brief.revision,
    updatedAt: new Date().toISOString(),
    activePreset: preset,
    weights,
    options: evaluatedOptions,
    recommendedOptionId: recommended.id,
    selectedOptionId: recommended.id,
    recommendationRationale: `Se recomienda "${recommended.name}" (${recommended.weightedScore} pts con perfil '${PRIORITY_PRESETS[preset].label}') porque supera todas las restricciones comprobables (${brief.constraints.targetOs}, ${brief.constraints.executionMode}) y ofrece el mejor equilibrio entre velocidad de construcción, operación local sin fricción y costo base $0.`,
    prioritySensitivityExplanation: runnerUp
      ? `¿Qué cambiaría la decisión? Si tu prioridad principal pasara a ser empaquetar un ejecutable nativo independiente con ícono en la bandeja del sistema de Windows sin depender del navegador, entonces "${runnerUp.name}" (${runnerUp.weightedScore} pts) sería preferible a cambio de mayor tiempo inicial de compilación.`
      : 'Ninguna otra alternativa cumple simultáneamente las restricciones duras de ejecución local y presupuesto.',
    jevEvaluationId: jevStackEval.evaluation.id,
  };
}

/**
 * Recalcula de inmediato los puntajes compuestos al cambiar las prioridades o pesos del usuario.
 */
export function recalculateStackComparisonWeights(
  current: StackComparison,
  preset: PriorityPresetId,
  customWeights?: DimensionWeights
): StackComparison {
  const weights = customWeights ?? PRIORITY_PRESETS[preset].weights;
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const dimensionKeys: StackDimensionKey[] = [
    'functionalFit',
    'buildTime',
    'operations',
    'cost',
    'experience',
    'integrations',
    'evolution',
  ];

  const updatedOptions = current.options.map((opt) => {
    let sum = 0;
    for (const dim of dimensionKeys) {
      sum += opt.dimensions[dim].scoreNormalized * (weights[dim] / totalWeight);
    }
    return {
      ...opt,
      weightedScore: Number((sum * 100).toFixed(1)),
    };
  });

  const validSorted = updatedOptions
    .filter((o) => !o.disqualifiedByHardConstraint)
    .sort((a, b) => b.weightedScore - a.weightedScore);

  const recommended = validSorted[0] ?? updatedOptions[0];

  return {
    ...current,
    updatedAt: new Date().toISOString(),
    activePreset: preset,
    weights,
    options: updatedOptions,
    recommendedOptionId: recommended.id,
    recommendationRationale: `Propuesta recalculada con prioridad '${PRIORITY_PRESETS[preset].label}': "${recommended.name}" obtiene ${recommended.weightedScore}/100 pts cumpliendo las restricciones duras del proyecto.`,
  };
}

/**
 * Decisión documentada por separado sobre el stack del PROPIO OPTIMIZADOR (Forja),
 * según lo solicitado en "Comparación de tecnologías y elección del stack".
 */
export const OPTIMIZER_OWN_STACK_DECISION = {
  title: 'Stack del Propio Optimizador (Forja) vs. Stack Recomendado para Proyectos Futuros',
  chosenStack: [
    'Node.js v24.22.2 + TypeScript (tsx)',
    'React 19 + Vite 6 (Interfaz web local accesible)',
    'SQLite nativo (node:sqlite DatabaseSync con WAL)',
    '@typesafe-ai/sdk v0.7.0 (Jev System One API)',
    'rea-agents@6.8.0 (Reverse Engineer Anything CLI y MCP)',
  ],
  rationale:
    'Elegimos una aplicación web local servida por un proceso Node.js 24 con SQLite nativo porque permite inspeccionar carpetas reales en Windows, ejecutar git/rea, modificar archivos de clientes locales con respaldos SHA-256 y resguardar TYPESAFE_API_KEY en el servidor sin requerir compiladores C++ ni infraestructura en la nube.',
  separationPrinciple:
    'Ninguna librería, plantilla o servidor MCP recomendado para los proyectos futuros del usuario se convierte en una dependencia permanente del propio optimizador Forja.',
  chosenArchitecture: 'Interfaz Web Local Full-Stack con Backend Local (Node.js 24 + TypeScript + React 18/Vite + node:sqlite)',
  evaluatedAt: '2026-11-03',
  hostEnvironment: 'Windows x64 (Node.js v24.22.2, git 2.47.1, rea-agents 6.8.0)',
  alternativesCompared: [
    {
      name: '1. Interfaz web local con backend local (ELEGIDA)',
      pros: [
        'Usa `node:sqlite` (`DatabaseSync`) nativo de Node 24: cero errores de compilación C++ (`node-gyp`) en Windows.',
        'Acceso directo y seguro desde el proceso servidor local a `~/.codex/config.toml`, `~/.claude.json`, `~/.cursor/mcp.json`, `~/.config/opencode/opencode.jsonc`, `git` y `rea`.',
        'Aísla `TYPESAFE_API_KEY`, `OPENAI_API_KEY`, `GITHUB_TOKEN` y `X_BEARER_TOKEN` en el servidor local sin exponerlos en el frontend ni en commits.',
      ],
      cons: ['Se visualiza en el navegador local (`http://localhost:3847`) mientras el proceso local está activo.'],
    },
    {
      name: '2. Aplicación de escritorio empaquetada (Electron / Tauri)',
      pros: ['Ventana de escritorio propia sin abrir pestaña en el navegador.'],
      cons: [
        'Agrega peso (~180 MB en Electron) o dependencia de compilador Rust/C++ (en Tauri) sin aportar ventajas funcionales para preparar entornos locales.',
      ],
    },
    {
      name: '3. Aplicación web remota con ejecutor/daemon local',
      pros: ['Interfaz accesible desde fuera de la PC.'],
      cons: [
        'Exige mantener dos procesos sincronizados, configurar túneles/CORS hacia localhost y gestionar credenciales en dos sitios.',
      ],
    },
  ],
};
