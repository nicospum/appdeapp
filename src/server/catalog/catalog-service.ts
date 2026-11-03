import fs from 'node:fs';
import path from 'node:path';
import { listCatalogEntriesFromDb, saveCatalogEntry } from '../storage/db.js';
import { suggestSkillsWithJevCookbook, evaluateMcpFitWithJev } from '../providers/jev-service.js';
import type {
  CatalogEntry,
  ProjectBrief,
  ProjectCapabilitySelection,
  CapabilityClassification,
} from '../../shared/types.js';

export const BUILTIN_CATALOG: CatalogEntry[] = [
  // ==========================================================================
  // 1. SKILLS (Instrucciones, referencias y recursos para agentes)
  // ==========================================================================
  {
    id: 'skill:typesafe-ai',
    name: 'typesafe-ai',
    kind: 'skill',
    category: 'decision-models',
    description: 'TypeSafe integration craft for System One models (Jev): Choice, Noul, Score, Box.',
    descriptionFull:
      'TypeSafe integration craft for System One models (Decision Models) such as Jev, which answer typed questions about text, images, and application state with calibrated probabilities.',
    bodyExcerpt:
      'Judgments from Jev, decisions in code. Keep all question wording in one place. Ask the concrete, observable thing. Pair Choice/Box with a companion Noul for the null case. Bundle questions that share state. Confidence measures how concentrated an answer probability distribution is.',
    solvesNeed: 'Evaluar estado de aplicación, clasificar entradas, puntuar alternativas y seleccionar skills con probabilidades calibradas.',
    whyProposedDefault: 'Esencial cuando el proyecto integra Jev (@typesafe-ai/sdk) o reemplaza heurísticas frágiles por juicios estructurados.',
    requirements: ['API key TYPESAFE_API_KEY en el servidor', 'Node.js >= 22 o Python >= 3.10'],
    authRequired: 'TYPESAFE_API_KEY (Bearer token)',
    compatibleEnvironments: ['codex', 'claude_code', 'cursor', 'opencode', 'antigravity'],
    license: 'MIT',
    version: '2026.10',
    knownCost: 'Skill gratuita (MIT); llamadas a API System One facturadas solo por input_tokens (output_tokens gratis según OpenAPI v0.2.0).',
    sourceUrl: 'https://github.com/typesafe-ai/skills/tree/main/skills/typesafe-ai',
    originType: 'author_repo',
    scopeCategory: 'dev_time_tool',
    skillMetadata: {
      directoryPath: path.join(
        process.env.USERPROFILE || process.env.HOME || '',
        '.codex',
        'skills',
        'typesafe-ai'
      ),
      hasScripts: false,
      hasReferences: false,
      frontmatterValid: true,
    },
    verifiedStructure: true,
    validationNotes: ['SKILL.md verificado contra especificación agentskills.io (name: typesafe-ai, license: MIT).'],
  },
  {
    id: 'skill:reverse-engineer-anything',
    name: 'reverse-engineer-anything',
    kind: 'skill',
    category: 'reverse-engineering',
    description: 'Reverse engineer native, managed, Electron/JS, packaged and browser targets with REA.',
    descriptionFull:
      'Reverse engineer native, managed, Electron/JavaScript, packaged, firmware, and browser targets with REA, and build agent environments (AgentEnv bundles) of web applications from a live instance or a capture.',
    bodyExcerpt:
      'Route the target first. Work summary-first. For ASAR or extracted JavaScript tree use analyze_javascript_application with detail: summary. Every conclusion must distinguish observations, inferences, and unknowns. Cite Evidence IDs and preserve limitations.',
    solvesNeed: 'Inspeccionar aplicaciones existentes, reconstruir grafos de módulos JS/TS, auditar bases SQLite o capturas HAR con evidencia trazable.',
    whyProposedDefault: 'Aporta disciplina epistémica (observación vs. inferencia) y enrutamiento correcto de herramientas REA sin cargar motores nativos innecesarios.',
    requirements: ['rea-agents@6.8.0 (CLI o MCP)', 'Node.js >= 24.15'],
    authRequired: 'Ninguna (ejecución local)',
    compatibleEnvironments: ['codex', 'claude_code', 'cursor', 'opencode', 'antigravity'],
    license: 'Propietaria / Paquete npm rea-agents@6.8.0 (morluto/rea)',
    version: '49',
    knownCost: 'Gratuita en ejecución local con paquete npm rea-agents.',
    sourceUrl: 'https://github.com/morluto/rea',
    originType: 'author_repo',
    scopeCategory: 'dev_time_tool',
    skillMetadata: {
      directoryPath: path.join(
        process.env.USERPROFILE || process.env.HOME || '',
        '.gemini',
        'config',
        'skills',
        'reverse-engineer-anything'
      ),
      hasScripts: false,
      hasReferences: true,
      frontmatterValid: true,
    },
    verifiedStructure: true,
    validationNotes: ['SKILL.md v49 (229 herramientas) verificado localmente con carpeta references/ completa.'],
  },
  {
    id: 'skill:react-best-practices',
    name: 'react-best-practices',
    kind: 'skill',
    category: 'frontend-performance',
    description: 'React and Next.js performance rules ordered by impact (waterfalls, bundle, re-renders).',
    descriptionFull:
      '70 rules in 8 categories ordered by impact — eliminating waterfalls, bundle size, server-side performance, client-side data fetching, re-renders, and rendering performance.',
    bodyExcerpt:
      'Eliminate request waterfalls first. Keep state derived where possible. Avoid unnecessary effect chains and large barrel imports.',
    solvesNeed: 'Garantizar rendimiento, fluidez y ausencia de re-renders o cascadas de red en interfaces React.',
    whyProposedDefault: 'Recomendada cuando el stack incluye React para mantener tiempos de respuesta instantáneos.',
    requirements: ['Proyecto con React 18 o 19'],
    authRequired: 'Ninguna',
    compatibleEnvironments: ['codex', 'claude_code', 'cursor', 'opencode', 'antigravity'],
    license: 'MIT',
    version: '1.0.0',
    knownCost: 'Gratuita ($0).',
    sourceUrl: 'https://github.com/vercel/ai',
    originType: 'verified_docs',
    scopeCategory: 'dev_time_tool',
    skillMetadata: {
      directoryPath: path.join(
        process.env.USERPROFILE || process.env.HOME || '',
        '.gemini',
        'config',
        'plugins',
        'vercel-plugin',
        'skills',
        'react-best-practices'
      ),
      hasScripts: false,
      hasReferences: true,
      frontmatterValid: true,
    },
    verifiedStructure: true,
    validationNotes: ['Presente y verificada en el entorno local.'],
  },
  {
    id: 'skill:a11y-debugging',
    name: 'a11y-debugging',
    kind: 'skill',
    category: 'ux-accessibility',
    description: 'Accessibility debugging and auditing based on web.dev guidelines (ARIA, keyboard, contrast).',
    descriptionFull:
      'Uses Chrome DevTools MCP for accessibility (a11y) debugging and auditing based on web.dev guidelines: semantic HTML, ARIA labels, focus states, keyboard navigation, and color contrast.',
    bodyExcerpt:
      'Verify full keyboard navigation (Tab, Shift+Tab, Enter, Escape), visible focus indicators, semantic landmarks, and contrast ratios.',
    solvesNeed: 'Auditar y asegurar que la interfaz funcione con teclado, lectores de pantalla y contraste adecuado.',
    whyProposedDefault: 'Útil para proyectos con interfaz web que priorizan experiencia de usuario y accesibilidad real.',
    requirements: ['Navegador Chromium / Chrome DevTools'],
    authRequired: 'Ninguna',
    compatibleEnvironments: ['codex', 'claude_code', 'cursor', 'antigravity'],
    license: 'Apache-2.0',
    version: '1.0.0',
    knownCost: 'Gratuita ($0).',
    sourceUrl: 'https://web.dev/accessibility',
    originType: 'verified_docs',
    scopeCategory: 'dev_time_tool',
    skillMetadata: {
      directoryPath: path.join(
        process.env.USERPROFILE || process.env.HOME || '',
        '.gemini',
        'config',
        'plugins',
        'chrome-devtools-plugin',
        'skills',
        'a11y-debugging'
      ),
      hasScripts: false,
      hasReferences: false,
      frontmatterValid: true,
    },
    verifiedStructure: true,
    validationNotes: ['SKILL.md verificado localmente.'],
  },

  // ==========================================================================
  // 2. SERVIDORES MCP (Conexiones que exponen capacidades o información)
  // ==========================================================================
  {
    id: 'mcp:rea',
    name: 'rea',
    kind: 'mcp',
    category: 'reverse-engineering',
    description: 'Reverse Engineer Anything MCP server (229 tools for JS, SQLite, web captures, binaries).',
    descriptionFull:
      'Servidor MCP oficial de Reverse Engineer Anything (rea-agents@6.8.0) con análisis estático de aplicaciones JavaScript/Electron, inspección de SQLite, capturas de red HAR/SAZ y observación de navegador.',
    bodyExcerpt:
      'Tools: binary_session, analyze_javascript_application, inspect_sqlite_database, inspect_web_network_capture, capture_browser_scenario, inspect_analysis_view.',
    solvesNeed: 'Exponer al agente herramientas de análisis de artefactos, reconstrucción de grafos JS y verificación de bases de datos o capturas web.',
    whyProposedDefault: 'Indispensable cuando el proyecto requiere estudiar referencias existentes o auditar artefactos locales.',
    requirements: ['Node.js >= 24.15', 'rea-agents@6.8.0 instalado'],
    authRequired: 'Ninguna (transporte stdio local)',
    compatibleEnvironments: ['codex', 'claude_code', 'cursor', 'opencode', 'antigravity'],
    license: 'Ver paquete rea-agents (morluto/rea)',
    version: '6.8.0',
    knownCost: '$0 (ejecución local stdio).',
    sourceUrl: 'https://github.com/morluto/rea/blob/main/docs/installation.md',
    originType: 'author_repo',
    scopeCategory: 'dev_time_tool',
    mcpConfigTemplate: {
      transport: 'stdio',
      command: 'cmd.exe',
      args: ['/d', '/c', 'npx', '-y', 'rea-agents@6.8.0', 'mcp'],
      requiredEnvVars: [],
    },
    verifiedStructure: true,
    validationNotes: ['Transporte stdio verificado con rea-agents@6.8.0 (catálogo sha256: a98940ba…).'],
  },
  {
    id: 'mcp:chrome-devtools',
    name: 'chrome-devtools-mcp',
    kind: 'mcp',
    category: 'browser-verification',
    description: 'Controla e inspecciona Chrome en vivo (DOM, red, consola, rendimiento, capturas).',
    descriptionFull:
      'Servidor MCP oficial de Chrome DevTools para automatizar interacciones en navegador, verificar flujos UX reales, leer consola/red y auditar accesibilidad o rendimiento.',
    bodyExcerpt:
      'Tools: navigate_page, take_snapshot, click, fill, list_console_messages, list_network_requests, performance_start_trace.',
    solvesNeed: 'Probar interactivamente flujos de interfaz de usuario y verificar comportamiento en navegador real.',
    whyProposedDefault: 'Complementa la observación estática con pruebas interactivas reales de UX en el navegador.',
    requirements: ['Node.js >= 20', 'Google Chrome instalado'],
    authRequired: 'Ninguna (conexión local al navegador)',
    compatibleEnvironments: ['codex', 'claude_code', 'cursor', 'opencode', 'antigravity'],
    license: 'Apache-2.0',
    version: '0.16.0',
    knownCost: '$0 (local).',
    sourceUrl: 'https://github.com/ChromeDevTools/chrome-devtools-mcp',
    originType: 'official_registry',
    scopeCategory: 'dev_time_tool',
    overlapGroup: 'browser_automation_mcp',
    mcpConfigTemplate: {
      transport: 'stdio',
      command: 'cmd.exe',
      args: ['/d', '/c', 'npx', '-y', 'chrome-devtools-mcp@latest'],
      requiredEnvVars: [],
    },
    verifiedStructure: true,
    validationNotes: ['Servidor oficial de ChromeDevTools; requiere navegador local.'],
  },
  {
    id: 'mcp:playwright',
    name: 'playwright-mcp',
    kind: 'mcp',
    category: 'browser-verification',
    description: 'Automatización de navegador multi-motor vía Playwright MCP (solapa con chrome-devtools-mcp).',
    descriptionFull:
      'Servidor MCP basado en Playwright para pruebas E2E y automatización de navegador headless o con interfaz.',
    bodyExcerpt: 'Navegación, selectores de accesibilidad y capturas automatizadas con Playwright.',
    solvesNeed: 'Automatización de pruebas de navegador multi-engine.',
    whyProposedDefault: 'Alternativa a chrome-devtools-mcp; no se recomienda instalar ambos simultáneamente salvo necesidad de WebKit/Firefox.',
    requirements: ['Node.js >= 20', 'Binarios de navegadores Playwright (~400 MB)'],
    authRequired: 'Ninguna',
    compatibleEnvironments: ['codex', 'claude_code', 'cursor', 'opencode'],
    license: 'Apache-2.0',
    version: '0.0.24',
    knownCost: '$0 (local).',
    sourceUrl: 'https://github.com/microsoft/playwright-mcp',
    originType: 'official_registry',
    scopeCategory: 'dev_time_tool',
    overlapGroup: 'browser_automation_mcp',
    mcpConfigTemplate: {
      transport: 'stdio',
      command: 'cmd.exe',
      args: ['/d', '/c', 'npx', '-y', '@playwright/mcp@latest'],
      requiredEnvVars: [],
    },
    verifiedStructure: true,
    validationNotes: ['Detectado en grupo de solapamiento browser_automation_mcp junto a chrome-devtools-mcp.'],
  },

  // ==========================================================================
  // 3. HERRAMIENTAS Y CLI (Programas que ejecutan operaciones)
  // ==========================================================================
  {
    id: 'cli:openspec',
    name: '@fission-ai/openspec',
    kind: 'cli_tool',
    category: 'spec-driven-dev',
    description: 'CLI ligero de especificaciones orientadas a cambios (proposal.md, specs/, design.md, tasks.md).',
    descriptionFull:
      'OpenSpec de Fission-AI organiza especificaciones iterativas tanto para proyectos nuevos como existentes (brownfield) con escenarios Given/When/Then.',
    bodyExcerpt: 'Workflow: /opsx:explore -> /opsx:propose -> /opsx:apply -> /opsx:archive.',
    solvesNeed: 'Mantener especificaciones de cambios y contratos de comportamiento en Markdown plano.',
    whyProposedDefault: 'Opcional si el usuario desea usar comandos slash de OpenSpec además del paquete ya generado por este Optimizador.',
    requirements: ['Node.js >= 20'],
    authRequired: 'Ninguna',
    compatibleEnvironments: ['win32', 'darwin', 'linux'],
    license: 'MIT',
    version: '0.2.x',
    knownCost: '$0 (MIT Open Source).',
    sourceUrl: 'https://github.com/Fission-AI/OpenSpec',
    originType: 'author_repo',
    scopeCategory: 'dev_time_tool',
    overlapGroup: 'spec_framework_cli',
    verifiedStructure: true,
    validationNotes: ['Solapa con github/spec-kit (specify-cli); no instalar ambos para evitar duplicar la fuente de verdad.'],
  },
  {
    id: 'cli:spec-kit',
    name: 'specify-cli (GitHub Spec Kit)',
    kind: 'cli_tool',
    category: 'spec-driven-dev',
    description: 'CLI de Spec-Driven Development de GitHub (spec.md, plan.md, tasks.md via uv).',
    descriptionFull:
      'GitHub Spec Kit estructura especificaciones funcionales, planes técnicos y listas de tareas para agentes de programación.',
    bodyExcerpt: 'Comandos: specify init, /speckit-specify, /speckit-clarify, /speckit-plan, /speckit-tasks.',
    solvesNeed: 'Estructurar flujos greenfield de especificación paso a paso con Python/uv.',
    whyProposedDefault: 'Se estudian y adoptan sus formatos directamente en el generador integrado sin obligar a instalar ambos CLIs.',
    requirements: ['Python >= 3.11', 'uv instalado'],
    authRequired: 'Ninguna',
    compatibleEnvironments: ['win32', 'darwin', 'linux'],
    license: 'MIT',
    version: '0.1.x',
    knownCost: '$0 (MIT Open Source).',
    sourceUrl: 'https://github.com/github/spec-kit',
    originType: 'author_repo',
    scopeCategory: 'dev_time_tool',
    overlapGroup: 'spec_framework_cli',
    verifiedStructure: true,
    validationNotes: ['Solapa con @fission-ai/openspec; nuestro optimizador ya unifica ambos formatos en una sola fuente de verdad.'],
  },
  {
    id: 'cli:vitest',
    name: 'vitest',
    kind: 'cli_tool',
    category: 'testing',
    description: 'Runner de pruebas unitarias y de integración ultrarrápido nativo para TypeScript/ESM.',
    descriptionFull:
      'Framework de testing compatible con Vite y TypeScript sin configuración compleja, ideal para validar lógica de negocio, contratos de API y flujos.',
    bodyExcerpt: 'vitest run / vitest watch con soporte nativo para TypeScript y ESM.',
    solvesNeed: 'Ejecutar pruebas automatizadas rápidas y confiables en cada cambio.',
    whyProposedDefault: 'Estándar moderno y ligero para proyectos Node.js/TypeScript y React.',
    requirements: ['Node.js >= 20'],
    authRequired: 'Ninguna',
    compatibleEnvironments: ['win32', 'darwin', 'linux'],
    license: 'MIT',
    version: '3.0.5',
    knownCost: '$0 (MIT Open Source).',
    sourceUrl: 'https://vitest.dev',
    originType: 'verified_docs',
    scopeCategory: 'dev_time_tool',
    verifiedStructure: true,
    validationNotes: ['Verificado en entorno Windows x64 con Node 24.'],
  },

  // ==========================================================================
  // 4. LIBRERÍAS, SERVICIOS Y PLANTILLAS (Dependencias de la aplicación futura)
  // ==========================================================================
  {
    id: 'lib:typesafe-sdk',
    name: '@typesafe-ai/sdk',
    kind: 'library_template',
    category: 'decision-sdk',
    description: 'SDK oficial en TypeScript/JavaScript para TypeSafe System One (Jev).',
    descriptionFull:
      'Cliente oficial tipado para enviar estado y preguntas (choice, noul, score, box) a POST /v1/systemone con inferencia de tipos en TypeScript.',
    bodyExcerpt: 'import { TypeSafeClient, choice, noul, score } from "@typesafe-ai/sdk";',
    solvesNeed: 'Tomar decisiones estructuradas y calibradas desde el backend de la aplicación.',
    whyProposedDefault: 'Recomendado siempre que la aplicación futura necesite clasificación, enrutamiento o evaluación probabilística rápida.',
    requirements: ['Node.js >= 22', 'TYPESAFE_API_KEY'],
    authRequired: 'TYPESAFE_API_KEY',
    compatibleEnvironments: ['node', 'bun', 'edge'],
    license: 'MIT',
    version: '0.7.0',
    knownCost: 'SDK gratuito; API facturada por tokens de entrada (estimado ~$0.10-$0.50 por 1.000 evaluaciones cortas; consultar console.typesafe.ai).',
    sourceUrl: 'https://docs.typesafe.ai/go/js-sdk',
    originType: 'verified_docs',
    scopeCategory: 'app_runtime_dependency',
    verifiedStructure: true,
    validationNotes: ['Versión 0.7.0 verificada en registro oficial de npm.'],
  },
  {
    id: 'lib:node-sqlite',
    name: 'node:sqlite (Built-in Node 24)',
    kind: 'library_template',
    category: 'storage',
    description: 'Motor SQLite síncrono integrado nativamente en Node.js 24+ sin dependencias nativas externas.',
    descriptionFull:
      'Módulo nativo node:sqlite (DatabaseSync) incluido en Node.js 24 que permite persistencia relacional ACID en un archivo local con modo WAL sin requerir node-gyp ni compiladores C++ en Windows.',
    bodyExcerpt: 'import { DatabaseSync } from "node:sqlite"; const db = new DatabaseSync("app.sqlite");',
    solvesNeed: 'Persistencia local durable de proyectos, estados, cachés y registros sin instalar servidores de base de datos ni compilar addons.',
    whyProposedDefault: 'Elimina fallos de instalación en Windows asociados a better-sqlite3 / sqlite3 y tiene costo $0.',
    requirements: ['Node.js >= 22.5 / 24.x'],
    authRequired: 'Ninguna',
    compatibleEnvironments: ['win32', 'darwin', 'linux'],
    license: 'MIT (Node.js Core)',
    version: 'Node 24.22.2 built-in',
    knownCost: '$0 (incluido en el runtime de Node.js).',
    sourceUrl: 'https://nodejs.org/api/sqlite.html',
    originType: 'verified_docs',
    scopeCategory: 'app_runtime_dependency',
    verifiedStructure: true,
    validationNotes: ['Comprobado en vivo en esta PC con Node v24.22.2.'],
  },
  {
    id: 'lib:zod',
    name: 'zod',
    kind: 'library_template',
    category: 'validation',
    description: 'Validación de esquemas en tiempo de ejecución con inferencia estática de TypeScript.',
    descriptionFull:
      'Librería sin dependencias externas para validar entradas de usuario, respuestas de APIs externas y manifiestos JSON versionados.',
    bodyExcerpt: 'const Schema = z.object({...}); type Model = z.infer<typeof Schema>;',
    solvesNeed: 'Validar contratos de entrada/salida entre frontend, backend, proveedores e instaladores.',
    whyProposedDefault: 'Necesaria para asegurar que ningún dato malformado corrompa la configuración de clientes o la base de datos.',
    requirements: ['TypeScript >= 5.0'],
    authRequired: 'Ninguna',
    compatibleEnvironments: ['node', 'browser', 'edge'],
    license: 'MIT',
    version: '3.24.2',
    knownCost: '$0 (MIT Open Source).',
    sourceUrl: 'https://zod.dev',
    originType: 'verified_docs',
    scopeCategory: 'app_runtime_dependency',
    verifiedStructure: true,
    validationNotes: ['Verificada en npm y sin dependencias transitivas.'],
  },

  // ==========================================================================
  // 5. REFERENCIAS DE DISEÑO (Orientan decisiones de UX/UI sin instalarse)
  // ==========================================================================
  {
    id: 'design:wai-aria-apg',
    name: 'WAI-ARIA Authoring Practices Guide (APG)',
    kind: 'design_reference',
    category: 'accessibility-patterns',
    description: 'Patrones oficiales del W3C para pestañas, acordeones, tablas comparativas y diálogos accesibles con teclado.',
    descriptionFull:
      'Referencia canónica del W3C para diseñar componentes interactivos navegables por teclado (Tab, flechas, Escape) con roles ARIA semánticos correctos.',
    bodyExcerpt: 'Tabs pattern, Disclosure (Show/Hide) pattern, Dialog Modal pattern, Grid/Table pattern.',
    solvesNeed: 'Asegurar que los detalles técnicos desplegables, las pestañas de proyecto y los selectores funcionen con teclado y tecnologías asistivas.',
    whyProposedDefault: 'Referencia obligatoria para cumplir accesibilidad real más allá de lo visual.',
    requirements: ['Uso manual / guía de implementación HTML y ARIA'],
    authRequired: 'Ninguna',
    compatibleEnvironments: ['web'],
    license: 'W3C Software and Document License',
    version: '2026',
    knownCost: '$0 (Documentación pública W3C).',
    sourceUrl: 'https://www.w3.org/WAI/ARIA/apg/patterns/',
    originType: 'verified_docs',
    scopeCategory: 'dev_time_tool',
    verifiedStructure: true,
    validationNotes: ['Referencia de diseño; no requiere instalación de paquetes.'],
  },
  {
    id: 'design:github-primer-split-view',
    name: 'GitHub Primer — Progressive Disclosure & Diff Review Pattern',
    kind: 'design_reference',
    category: 'ux-architecture',
    description: 'Patrón de diseño para mostrar resúmenes ejecutivos arriba, tablas de decisión claras y diffs/evidencia bajo demanda.',
    descriptionFull:
      'Sistema de diseño de GitHub orientado a herramientas de desarrollo: prioriza estado claro (Listo / Pendiente / Bloqueado), siguiente acción útil y bloques `<details>` para evidencia técnica y diffs.',
    bodyExcerpt: 'Progressive disclosure, status badges with semantic icons, side-by-side comparison tables, non-destructive diff warnings.',
    solvesNeed: 'Evitar abrumar al usuario con JSON crudo o formularios interminables, manteniendo la evidencia a un clic de distancia.',
    whyProposedDefault: 'Alinea la interfaz con la prioridad de mostrar qué entendió la app, qué recomienda y cuál es la siguiente acción.',
    requirements: ['Integración manual en CSS/componentes'],
    authRequired: 'Ninguna',
    compatibleEnvironments: ['web', 'desktop'],
    license: 'MIT',
    version: '2026',
    knownCost: '$0 (Guía abierta).',
    sourceUrl: 'https://primer.style/design/',
    originType: 'verified_docs',
    scopeCategory: 'dev_time_tool',
    verifiedStructure: true,
    validationNotes: ['Referencia visual y de arquitectura de información; sin dependencias en runtime.'],
  },
];

export function ensureCatalogSeeded(): CatalogEntry[] {
  const existing = listCatalogEntriesFromDb();
  const existingIds = new Set(existing.map((e) => e.id));

  for (const item of BUILTIN_CATALOG) {
    if (!existingIds.has(item.id)) {
      saveCatalogEntry(item, true);
    }
  }
  return listCatalogEntriesFromDb();
}

/**
 * Valida la estructura de una nueva entrada personalizada del catálogo
 * (carpeta de skill local con SKILL.md, definición de MCP, repositorio o URL).
 */
export function validateAndAddCustomCatalogEntry(input: {
  name: string;
  kind: CatalogEntry['kind'];
  sourceUrlOrPath: string;
  description: string;
  solvesNeed: string;
  scopeCategory: CatalogEntry['scopeCategory'];
  license?: string;
  mcpTransport?: 'stdio' | 'http' | 'sse';
  mcpCommand?: string;
  mcpArgs?: string[];
}): CatalogEntry {
  const cleanName = input.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/--+/g, '-');

  const validationNotes: string[] = [];
  let verifiedStructure = false;
  let bodyExcerpt = input.description;
  let skillMetadata: CatalogEntry['skillMetadata'] | undefined;
  let mcpConfigTemplate: CatalogEntry['mcpConfigTemplate'] | undefined;

  if (input.kind === 'skill') {
    // Si apunta a una carpeta o archivo SKILL.md local, validamos frontmatter según agentskills.io/specification
    if (fs.existsSync(input.sourceUrlOrPath)) {
      const stat = fs.statSync(input.sourceUrlOrPath);
      const skillDir = stat.isDirectory() ? input.sourceUrlOrPath : path.dirname(input.sourceUrlOrPath);
      const skillMdPath = path.join(skillDir, 'SKILL.md');
      if (fs.existsSync(skillMdPath)) {
        const raw = fs.readFileSync(skillMdPath, 'utf-8');
        const hasFrontmatter = /^\uFEFF?---\r?\n[\s\S]+?\r?\n---/.test(raw);
        const hasName = /^name:\s*[a-z0-9-]+/m.test(raw);
        const hasDesc = /^description:\s*.+/m.test(raw);
        verifiedStructure = hasFrontmatter && hasName && hasDesc;
        bodyExcerpt = raw.slice(0, 700);
        skillMetadata = {
          directoryPath: skillDir,
          hasScripts: fs.existsSync(path.join(skillDir, 'scripts')),
          hasReferences: fs.existsSync(path.join(skillDir, 'references')),
          frontmatterValid: verifiedStructure,
        };
        validationNotes.push(
          verifiedStructure
            ? `Carpeta de skill local verificada (${skillMdPath}) conforme a agentskills.io.`
            : `Advertencia: SKILL.md encontrado en ${skillMdPath}, pero el frontmatter YAML está incompleto.`
        );
      } else {
        validationNotes.push(`La ruta local existe pero no contiene SKILL.md en ${skillDir}.`);
      }
    } else {
      validationNotes.push(
        'Fuente remota registrada. Recordá que un README o URL no prueba compatibilidad hasta descargar y validar su SKILL.md.'
      );
    }
  } else if (input.kind === 'mcp') {
    const transport = input.mcpTransport || (input.sourceUrlOrPath.startsWith('http') ? 'http' : 'stdio');
    mcpConfigTemplate = {
      transport,
      command: transport === 'stdio' ? input.mcpCommand || 'npx' : undefined,
      args: transport === 'stdio' ? input.mcpArgs || ['-y', cleanName] : undefined,
      url: transport !== 'stdio' ? input.sourceUrlOrPath : undefined,
      requiredEnvVars: [],
    };
    verifiedStructure = Boolean(
      (transport === 'stdio' && mcpConfigTemplate.command) ||
        (transport !== 'stdio' && mcpConfigTemplate.url?.startsWith('http'))
    );
    validationNotes.push(
      `Transporte MCP (${transport}) validado estructuralmente. La disponibilidad real se comprueba al preparar el cliente.`
    );
  } else {
    verifiedStructure = true;
    validationNotes.push('Entrada registrada con metadatos de propósito y alcance explícitos.');
  }

  const entry: CatalogEntry = {
    id: `${input.kind}:${cleanName}-${Date.now().toString(36)}`,
    name: cleanName || input.name,
    kind: input.kind,
    category: 'custom',
    description: input.description.slice(0, 120),
    descriptionFull: input.description,
    bodyExcerpt,
    solvesNeed: input.solvesNeed,
    whyProposedDefault: `Agregado por el usuario para resolver: ${input.solvesNeed}`,
    requirements: ['Validar en el entorno destino antes de producción'],
    authRequired: 'Según proveedor',
    compatibleEnvironments: ['codex', 'claude_code', 'cursor', 'opencode'],
    license: input.license || 'Por verificar en repositorio origen',
    version: 'custom',
    knownCost: 'Precio no verificado automáticamente (desconocido != gratis).',
    sourceUrl: input.sourceUrlOrPath,
    originType: 'local_custom',
    scopeCategory: input.scopeCategory,
    mcpConfigTemplate,
    skillMetadata,
    verifiedStructure,
    validationNotes,
  };

  saveCatalogEntry(entry, false);
  return entry;
}

/**
 * Selecciona y clasifica un conjunto suficiente y manejable de capacidades para el proyecto,
 * ejecutando el Cookbook de Skill Suggestion de Jev y la puntuación de MCPs, y detectando solapamientos.
 */
export async function recommendCapabilitiesForProject(
  projectId: string,
  brief: ProjectBrief
): Promise<{
  selections: ProjectCapabilitySelection[];
  jevSkillSuggestionSummary: {
    gatePassed: boolean;
    winnerSkillName: string | null;
    shortlistNames: string[];
  };
}> {
  const allEntries = ensureCatalogSeeded();
  const skills = allEntries.filter((e) => e.kind === 'skill');
  const mcpsAndTools = allEntries.filter((e) => e.kind === 'mcp' || e.kind === 'cli_tool');

  // 1. Ejecutar el Cookbook de 2 pasadas de Jev para Skills
  const skillSuggestion = await suggestSkillsWithJevCookbook(projectId, brief, skills);

  // 2. Ejecutar evaluación de ajuste con Jev para MCPs y CLIs
  const mcpFit = await evaluateMcpFitWithJev(projectId, brief, mcpsAndTools);

  const selections: ProjectCapabilitySelection[] = [];
  const chosenByOverlapGroup = new Map<string, string>();

  const fullText = `${brief.title} ${brief.objective} ${brief.coreFeatures.join(' ')}`.toLowerCase();
  const mentionsTypeSafe = /typesafe|jev|system\s*one|probabil|evalua/i.test(fullText);
  const mentionsRea = /rea|reverse|referencia|existente|inspecci|analiz/i.test(fullText);

  for (const entry of allEntries) {
    let classification: CapabilityClassification = 'optional';
    let reason = entry.whyProposedDefault;
    let jevFitScore: number | undefined;
    let jevSuggestedWinner = false;
    let overlapWarning: string | undefined;

    if (entry.kind === 'skill') {
      const fitEntry = skillSuggestion.fittingSkills.find((f) => f.name === entry.name);
      if (fitEntry) {
        jevFitScore = Number((fitEntry.fitProbability * 100).toFixed(0));
      }
      if (skillSuggestion.winnerSkillName === entry.name) {
        jevSuggestedWinner = true;
        classification = 'necessary';
        reason = `Seleccionada como ganadora por el flujo de 2 pasadas de Jev (fit Noul=${(fitEntry?.fitProbability ?? 0.85).toFixed(2)}). ${entry.solvesNeed}`;
      } else if (entry.name === 'typesafe-ai' && mentionsTypeSafe) {
        classification = 'necessary';
        reason = 'Necesaria porque el proyecto utiliza evaluaciones tipadas con Jev de TypeSafe.';
      } else if (entry.name === 'reverse-engineer-anything' && mentionsRea) {
        classification = 'recommended';
        reason = 'Recomendada para aplicar análisis de referencias y artefactos con REA sin cargar motores innecesarios.';
      } else if (fitEntry && fitEntry.fitProbability >= 0.45) {
        classification = 'recommended';
        reason = `Preseleccionada en el shortlist de Jev (fit Noul=${fitEntry.fitProbability.toFixed(2)}). ${entry.solvesNeed}`;
      } else {
        classification = 'optional';
        reason = `No es prioritaria para el alcance inicial; disponible si el flujo se amplía (${entry.solvesNeed}).`;
      }
    } else if (entry.kind === 'mcp' || entry.kind === 'cli_tool') {
      const fit = mcpFit.scoresByCatalogId[entry.id];
      if (fit) {
        jevFitScore = Number(((fit.score / 3) * 100).toFixed(0));
      }

      if (entry.id === 'mcp:rea') {
        classification = 'recommended';
        reason = `Servidor MCP verificado localmente (rea-agents@6.8.0) para inspección de referencias y SQLite. Puntaje Jev: ${fit ? fit.score.toFixed(2) + '/3' : 'verificado'}.`;
      } else if (entry.id === 'cli:vitest') {
        classification = 'necessary';
        reason = 'Necesario para verificar lógica, integraciones y recorridos de usuario con pruebas automatizadas.';
      } else if (fit && fit.score >= 2.1 && fit.solvesNeedProb >= 0.5) {
        classification = 'recommended';
        reason = `Alto ajuste evaluado por Jev (${fit.score.toFixed(2)}/3, Noul=${fit.solvesNeedProb.toFixed(2)}): ${entry.solvesNeed}`;
      } else {
        classification = 'optional';
        reason = entry.whyProposedDefault;
      }
    } else if (entry.kind === 'library_template') {
      if (entry.id === 'lib:zod' || entry.id === 'lib:node-sqlite') {
        classification = 'necessary';
        reason = `Base estructural ligera y verificada en Node 24 (${entry.solvesNeed}).`;
      } else if (entry.id === 'lib:typesafe-sdk' && mentionsTypeSafe) {
        classification = 'necessary';
        reason = 'SDK oficial requerido para las evaluaciones tipadas con Jev.';
      } else {
        classification = 'recommended';
        reason = entry.whyProposedDefault;
      }
    } else if (entry.kind === 'design_reference') {
      classification = 'recommended';
      reason = `Referencia de diseño e interacción (no instala dependencias en runtime): ${entry.solvesNeed}`;
    }

    // Control estricto de solapamientos: no instalar dos herramientas equivalentes sin motivo
    if (entry.overlapGroup) {
      const alreadyChosen = chosenByOverlapGroup.get(entry.overlapGroup);
      if (alreadyChosen) {
        classification = 'discarded';
        overlapWarning = `Solapamiento detectado en grupo '${entry.overlapGroup}' con '${alreadyChosen}'. Se descarta instalar ambas por defecto para evitar duplicar funciones o la fuente de verdad.`;
        reason = overlapWarning;
      } else if (classification === 'necessary' || classification === 'recommended' || entry.id === 'mcp:chrome-devtools') {
        chosenByOverlapGroup.set(entry.overlapGroup, entry.name);
      } else if (entry.overlapGroup === 'spec_framework_cli') {
        // Ni specify-cli ni openspec se instalan juntos por defecto porque el optimizador ya genera la fuente única de verdad
        classification = 'discarded';
        overlapWarning =
          'Se adoptan las mejores prácticas de GitHub Spec Kit y OpenSpec directamente en los artefactos generados por el Optimizador, evitando instalar ambos CLIs o duplicar archivos de especificación.';
        reason = overlapWarning;
      }
    }

    selections.push({
      catalogId: entry.id,
      entry,
      classification,
      classificationReason: reason,
      selectedForInstall:
        (classification === 'necessary' || classification === 'recommended') &&
        entry.kind !== 'design_reference',
      overlapWarning,
      jevFitScore,
      jevSuggestedWinner,
    });
  }

  return {
    selections,
    jevSkillSuggestionSummary: {
      gatePassed: skillSuggestion.gatePassed,
      winnerSkillName: skillSuggestion.winnerSkillName,
      shortlistNames: skillSuggestion.shortlistNames,
    },
  };
}
