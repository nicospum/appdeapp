import path from 'node:path';
import { evaluateBriefClarityWithJev } from '../providers/jev-service.js';
import type {
  ProjectMode,
  ProjectBrief,
  ExistingProjectInspection,
  InferredAssumption,
  ClarifyingQuestion,
  ProjectConstraints,
} from '../../shared/types.js';

function extractExplicitSentences(inputRaw: string): string[] {
  const lines = inputRaw
    .split(/\r?\n|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 6);
  return lines.slice(0, 12);
}

function detectContradictionsInInput(inputRaw: string): string[] {
  const lower = inputRaw.toLowerCase();
  const contradictions: string[] = [];

  if (
    (lower.includes('100% offline') || lower.includes('sin internet') || lower.includes('totalmente offline')) &&
    (lower.includes('api de openai') || lower.includes('tiempo real en x') || lower.includes('saas en la nube'))
  ) {
    contradictions.push(
      'Contradicción detectada: se solicita funcionamiento 100% sin conexión a internet y simultáneamente consumo en vivo de APIs remotas en la nube sin modo degradado.'
    );
  }

  if (
    (lower.includes('sin dependencias') || lower.includes('cero paquetes')) &&
    (lower.includes('electron') || lower.includes('next.js') || lower.includes('kubernetes'))
  ) {
    contradictions.push(
      'Contradicción detectada: se exige cero dependencias externas junto con un framework pesado de múltiples paquetes.'
    );
  }

  if (
    (lower.includes('presupuesto $0') || lower.includes('totalmente gratis')) &&
    (lower.includes('enterprise') || lower.includes('cluster dedicado') || lower.includes('api de x pro'))
  ) {
    contradictions.push(
      'Contradicción detectada: restricción de costo $0 frente a servicios con licenciamiento comercial/empresarial obligatorio.'
    );
  }

  return contradictions;
}

function deriveProjectTitle(inputRaw: string, existingInspection?: ExistingProjectInspection): string {
  const firstLine = inputRaw.split(/\r?\n/)[0]?.trim() || 'Proyecto Optimizado';
  const cleaned = firstLine.replace(/^[#\-*>\s]+/, '').slice(0, 72);
  if (existingInspection && existingInspection.exists) {
    const folderName = existingInspection.rootPath.split(/[\\/]/).pop() || 'Proyecto';
    return `${folderName} — ${cleaned.slice(0, 48)}`;
  }
  return cleaned || 'Nuevo Proyecto de Software';
}

/**
 * Construye una interpretación editable completa a partir de:
 * - Una idea mínima de una frase (genera primera propuesta útil, supuestos visibles y máx. 2 preguntas abiertas prioritarias), o
 * - Una descripción detallada (conserva todas las restricciones explícitas y solo pregunta por vacíos o contradicciones reales), o
 * - Un proyecto existente en modo "Agregar o mejorar una función" (preserva su stack y propone el cambio mínimo compatible).
 */
export async function buildInitialProjectBrief(params: {
  projectId: string;
  mode: ProjectMode;
  inputRaw: string;
  inputUrls: string[];
  existingInspection?: ExistingProjectInspection;
}): Promise<ProjectBrief> {
  const { projectId, mode, inputRaw, existingInspection } = params;
  const isDetailedInput = inputRaw.trim().length > 260 || inputRaw.split(/\r?\n/).length >= 5;

  // Evaluamos con Jev qué aspectos están definidos y cuáles necesitan aclaración
  const jevClarity = await evaluateBriefClarityWithJev(projectId, inputRaw, mode);

  const explicitFacts = extractExplicitSentences(inputRaw);
  if (params.inputUrls.length > 0) {
    explicitFacts.push(`URLs de contexto indicadas explícitamente: ${params.inputUrls.join(', ')}`);
  }
  if (existingInspection && existingInspection.exists) {
    explicitFacts.push(
      `Proyecto existente indicado en "${existingInspection.rootPath}" con stack detectado: ${existingInspection.detectedStack.join(', ')}.`
    );
  }

  const contradictionsDetected = detectContradictionsInInput(inputRaw);
  if (jevClarity.hasContradictionSignal && contradictionsDetected.length === 0) {
    contradictionsDetected.push(
      'Jev detectó posible tensión entre el alcance funcional solicitado y las restricciones operativas; revisá los supuestos antes de congelar el stack.'
    );
  }

  const lower = inputRaw.toLowerCase();

  // Restricciones extraídas respetando fielmente lo dicho por el usuario
  const lockedTechnologies: string[] = [];
  const forbiddenTechnologies: string[] = [];
  for (const tech of ['TypeScript', 'React', 'Node.js', 'SQLite', 'Python', 'FastAPI', 'Next.js', 'Tailwind', 'TypeSafe', 'REA']) {
    if (lower.includes(tech.toLowerCase())) {
      lockedTechnologies.push(tech);
    }
  }
  if (existingInspection && existingInspection.exists) {
    for (const st of existingInspection.detectedStack) {
      if (!lockedTechnologies.includes(st)) lockedTechnologies.push(st);
    }
  }
  if (/no usar\s+([a-z0-9._-]+)/i.test(inputRaw)) {
    const m = inputRaw.match(/no usar\s+([a-z0-9._-]+)/i);
    if (m?.[1]) forbiddenTechnologies.push(m[1]);
  }

  const constraints: ProjectConstraints = {
    targetOs: lower.includes('mac') ? 'macOS / Multiplataforma' : 'Windows 10/11 (compatible multiplataforma)',
    budgetLimit:
      lower.includes('gratis') || lower.includes('$0')
        ? '$0 en infraestructura fija (solo herramientas abiertas locales)'
        : 'Uso personal / bajo costo (sin infraestructura empresarial fija)',
    executionMode:
      !(
        lower.includes('sin nube') ||
        lower.includes('sin cloud') ||
        lower.includes('100% local') ||
        lower.includes('solo local')
      ) &&
      (lower.includes('nube') || lower.includes('cloud'))
        ? 'hybrid'
        : 'local_only',
    privacyLevel:
      lower.includes('privad') || lower.includes('local') ? 'strict_local' : 'standard_api',
    lockedTechnologies,
    forbiddenTechnologies,
    timelineExpectation: isDetailedInput
      ? 'Primera versión funcional completa por etapas verificables'
      : 'Prototipo funcional rápido (MVP realizable en 1-2 sesiones)',
  };

  // Supuestos inferidos explícitos y editables
  const inferredAssumptions: InferredAssumption[] = [
    {
      id: 'assump_exec_env',
      statement:
        mode === 'existing_feature' && existingInspection?.exists
          ? `Se conservará la arquitectura actual (${existingInspection.detectedStack.join(' + ')}) aplicando el cambio mínimo compatible en ${existingInspection.minimalChangeProposal.filesToTouch.join(', ') || 'los módulos existentes'}.`
          : 'La aplicación priorizará ejecución local en PC Windows con almacenamiento persistente en disco/SQLite, sin requerir servidores en la nube ni Docker obligatorio.',
      rationale:
        mode === 'existing_feature'
          ? 'Evitar reescrituras innecesarias y respetar las convenciones del repositorio existente.'
          : 'Minimizar fricción operativa y costo fijo para una herramienta personal.',
      category: 'architecture',
      accepted: true,
    },
    {
      id: 'assump_auth_scope',
      statement:
        'Uso personal monopuesto inicialmente (sin sistema complejo de multi-tenancy, facturación ni roles empresariales en la primera versión).',
      rationale:
        'Entregar valor funcional inmediato antes de agregar infraestructura de cuentas multi-usuario.',
      category: 'scope',
      accepted: true,
    },
    {
      id: 'assump_secrets_policy',
      statement:
        'Toda credencial de API externa vivirá únicamente en variables de entorno o almacén local del servidor (`.env` / `.data/`), nunca en el cliente ni en commits.',
      rationale: 'Garantizar seguridad por diseño al exportar o sincronizar con GitHub.',
      category: 'environment',
      accepted: true,
    },
  ];

  // Preguntas útiles (máximo 2 preguntas abiertas simultáneas para no bloquear con un formulario largo)
  const clarifyingQuestions: ClarifyingQuestion[] = [];

  if (mode === 'existing_feature' && existingInspection?.exists) {
    clarifyingQuestions.push({
      id: 'q_existing_integration_boundary',
      area: 'architecture',
      question: `¿Cómo preferís integrar la nueva función dentro de ${path.basename(existingInspection.rootPath)}?`,
      whyItMatters:
        'Define si modificamos directamente el flujo principal existente o si lo encapsulamos como módulo/pestaña optativa con impacto cero en el resto.',
      options: [
        {
          id: 'opt_modular_extension',
          label: '(Recomendado) Extensión modular conectada al catálogo/estado actual sin alterar funciones previas',
          impactOnProject: `Toca únicamente ${existingInspection.minimalChangeProposal.filesToTouch.slice(0, 2).join(' y ') || 'el punto de registro'} y facilita revertir o probar por separado.`,
          recommended: true,
        },
        {
          id: 'opt_deep_refactor',
          label: 'Refactorizar el flujo central existente para unificar todo en una sola vista',
          impactOnProject: 'Mayor cohesión visual, pero requiere volver a probar todas las funciones anteriores del proyecto.',
          recommended: false,
        },
      ],
      selectedOptionId: 'opt_modular_extension',
      status: 'open',
    });

    clarifyingQuestions.push({
      id: 'q_existing_test_strategy',
      area: 'scope',
      question: '¿Qué alcance de verificación querés incluir junto con este cambio incremental?',
      whyItMatters:
        'El proyecto actual tiene características específicas de pruebas; definir esto ajusta las tareas del agente.',
      options: [
        {
          id: 'opt_smoke_and_unit',
          label: '(Recomendado) Prueba automatizada focalizada en la función nueva + checklist de no regresión',
          impactOnProject: 'Verifica el cambio sin obligar a construir una suite E2E pesada para todo el código histórico.',
          recommended: true,
        },
        {
          id: 'opt_full_e2e',
          label: 'Configurar suite E2E completa de navegador para toda la aplicación',
          impactOnProject: 'Aumenta la cobertura global pero duplica el tiempo de preparación.',
          recommended: false,
        },
      ],
      selectedOptionId: 'opt_smoke_and_unit',
      status: 'open',
    });
  } else if (isDetailedInput) {
    // Ante un documento detallado, respetamos sus restricciones y solo preguntamos por vacíos o contradicciones reales
    clarifyingQuestions.push({
      id: 'q_detailed_external_fallbacks',
      area: 'architecture',
      question:
        contradictionsDetected.length > 0
          ? 'Se detectó una tensión entre ejecución local/costo y servicios externos: ¿cómo debe comportarse la app cuando una API externa no tenga credenciales o cuota?'
          : 'Para las integraciones externas opcionales (como X API v2 o runner remoto de GitHub), ¿qué política de degradación preferís?',
      whyItMatters:
        'Asegura que el flujo principal siga siendo 100% funcional en tu PC aunque una credencial externa opcional no esté activa.',
      options: [
        {
          id: 'opt_graceful_explicit',
          label: '(Recomendado) Degradación explícita y honesta: continuar con fuentes primarias/locales y marcar la integración pendiente',
          impactOnProject: 'No bloquea el trabajo ni inventa datos simulados; deja trazabilidad exacta de qué falta.',
          recommended: true,
        },
        {
          id: 'opt_strict_block',
          label: 'Bloquear la etapa completa hasta que todas las credenciales externas estén activas',
          impactOnProject: 'Garantiza cobertura total pero impide avanzar offline o sin cuenta paga de X.',
          recommended: false,
        },
      ],
      selectedOptionId: 'opt_graceful_explicit',
      status: 'open',
    });

    clarifyingQuestions.push({
      id: 'q_detailed_client_scope',
      area: 'scope',
      question: 'Al aplicar "Preparar entorno" en los clientes de agentes (Codex, Claude Code, Cursor), ¿qué alcance de escritura preferís por defecto?',
      whyItMatters:
        'Cambia si las skills y servidores MCP se registran en el perfil del usuario con respaldo reversible o únicamente dentro de la carpeta del proyecto.',
      options: [
        {
          id: 'opt_client_with_backup',
          label: '(Recomendado) Configurar en el cliente elegido con snapshot SHA-256 previo y botón de reversión limpia',
          impactOnProject: 'Deja a Codex / Cursor / Claude Code listos para trabajar de inmediato sin perder tus ajustes actuales.',
          recommended: true,
        },
        {
          id: 'opt_project_local_only',
          label: 'Escribir únicamente manifiestos locales dentro de la carpeta del proyecto',
          impactOnProject: 'Cero cambios en `~/.codex` o `~/.cursor`, pero algunos clientes requieren registro global para iniciar MCPs.',
          recommended: false,
        },
      ],
      selectedOptionId: 'opt_client_with_backup',
      status: 'open',
    });
  } else {
    // Idea mínima (una sola frase): máximo 2 preguntas concretas que cambian arquitectura, costo o experiencia
    clarifyingQuestions.push({
      id: 'q_minimal_persistence_and_access',
      area: 'architecture',
      question: '¿Dónde querés que funcione y guarde sus datos esta primera versión?',
      whyItMatters:
        'Cambia radicalmente la arquitectura, el costo mensual ($0 vs hosting cloud) y la necesidad de autenticación.',
      options: [
        {
          id: 'opt_local_first_sqlite',
          label: '(Recomendado) Aplicación local en tu PC (interfaz web local + SQLite / archivos locales, costo $0)',
          impactOnProject: 'Construcción rápida, privacidad total en tu máquina y cero costos de servidor.',
          recommended: true,
        },
        {
          id: 'opt_cloud_multiuser',
          label: 'Aplicación web publicada en internet para múltiples usuarios con cuentas y base en la nube',
          impactOnProject: 'Agrega autenticación, base de datos remota y despliegue cloud.',
          recommended: false,
        },
      ],
      selectedOptionId: 'opt_local_first_sqlite',
      status: 'open',
    });

    clarifyingQuestions.push({
      id: 'q_minimal_ux_priority',
      area: 'ux',
      question: '¿Qué experiencia principal te dará más valor en el primer entregable funcional?',
      whyItMatters:
        'Define si priorizamos velocidad y flujo directo de trabajo en una sola pantalla o paneles avanzados de análisis.',
      options: [
        {
          id: 'opt_focused_workflow',
          label: '(Recomendado) Flujo guiado de punta a punta en una interfaz clara con exportación y persistencia',
          impactOnProject: 'Permite usar la herramienta de inmediato y dejar automatizaciones secundarias para la etapa 2.',
          recommended: true,
        },
        {
          id: 'opt_cli_automation_first',
          label: 'Herramienta centrada en línea de comandos (CLI) y ejecución por lotes sin interfaz gráfica compleja',
          impactOnProject: 'Reduce el código de frontend al mínimo y prioriza scripts automatizables.',
          recommended: false,
        },
      ],
      selectedOptionId: 'opt_focused_workflow',
      status: 'open',
    });
  }

  // Extraer funciones principales y separar MVP realizable de mejoras futuras
  const extractedBullets = explicitFacts
    .filter((line) => line.length > 12 && !line.startsWith('URLs de contexto'))
    .slice(0, 6);

  const coreFeatures =
    extractedBullets.length >= 2
      ? extractedBullets
      : mode === 'existing_feature' && existingInspection?.exists
      ? [
          `Implementar "${inputRaw.trim()}" respetando la arquitectura ${existingInspection.detectedStack.join(' + ')}.`,
          `Integrar la función en ${existingInspection.minimalChangeProposal.filesToTouch.join(', ') || 'los módulos actuales'} sin regresiones.`,
          'Incluir validación de entradas, manejo de estados de error y prueba verificable.',
        ]
      : [
          `Flujo principal para: ${inputRaw.trim()}`,
          'Interfaz clara con entrada rápida, edición de resultados y estados visibles (vacío, carga, error y recuperación).',
          'Persistencia local automática para conservar el trabajo entre sesiones.',
          'Exportación portable de resultados en formatos estándar (Markdown / JSON).',
        ];

  const mvpScope = [
    ...coreFeatures.slice(0, 4),
    'Verificación automatizada del recorrido crítico de punta a punta.',
  ];

  const futureImprovements = [
    'Sincronización multi-dispositivo en la nube y colaboración en tiempo real para equipos.',
    'Marketplace comunitario de plantillas y plugins compartidos.',
    'Ejecución desatendida en segundo plano mediante demonios programados (cron) y notificaciones externas.',
  ];

  const title = deriveProjectTitle(inputRaw, existingInspection);

  return {
    revision: 1,
    updatedAt: new Date().toISOString(),
    title,
    objective:
      mode === 'existing_feature' && existingInspection?.exists
        ? `Agregar o mejorar en ${path.basename(existingInspection.rootPath)}: ${inputRaw.trim().slice(0, 300)}`
        : inputRaw.trim().slice(0, 400),
    targetUsers: isDetailedInput
      ? 'Desarrollador / creador que utiliza agentes de programación (Codex, Claude Code, Cursor, OpenCode) en su PC para convertir ideas en proyectos bien definidos y preparados.'
      : 'Uso personal del creador / desarrollador en su entorno local.',
    problemStatement:
      mode === 'existing_feature'
        ? `Ampliar las capacidades del proyecto existente con el cambio mínimo compatible, evitando duplicar código o alterar el stack consolidado.`
        : `Pasar de una idea o necesidad ("${title}") a una implementación bien estructurada, con decisiones técnicas justificadas, referencias comprobadas y entorno de trabajo preparado.`,
    coreFeatures,
    constraints,
    explicitFacts,
    inferredAssumptions,
    clarifyingQuestions: clarifyingQuestions.slice(0, 2), // Máximo 2 preguntas por interacción
    mvpScope,
    futureImprovements,
    contradictionsDetected,
    advancedWithAssumptions: false,
  };
}
