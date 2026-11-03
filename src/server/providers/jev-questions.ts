import { choice, noul, score } from '@typesafe-ai/sdk';
import type { CatalogEntry, StackDimensionKey } from '../../shared/types.js';

/**
 * Versión de las preguntas y rúbricas de Jev (System One).
 * Centralizado en un único módulo auditable según la skill oficial `typesafe-ai`:
 * "Keep all question wording in one place. Questions, options, criteria, and thresholds
 *  are the parts of an integration people audit and edit most."
 */
export const JEV_EVALUATION_VERSION = '2026.11.1';
export const DEFAULT_JEV_MODEL = 'jev-latest';

// ============================================================================
// Umbrales explícitos en código (Truth tables & gates)
// ============================================================================

export const JEV_THRESHOLDS = {
  // Para Noul: >= 0.70 indica sí claro; <= 0.30 indica no claro; entre 0.30 y 0.70 requiere aclaración/supuesto.
  NOUL_DEFINED_HIGH: 0.7,
  NOUL_MISSING_LOW: 0.3,

  // Cookbook oficial de Skill Suggestion (docs.typesafe.ai/cookbooks/skill_suggestion)
  SKILL_SHORTLIST_SIZE: 3,
  SKILL_EXCERPT_CHARS: 700,
  SKILL_ACTION_GATE_THRESHOLD: 0.3, // Promedio de las 3 preguntas de acción
  SKILL_NAMED_GATE_THRESHOLD: 0.5, // La solicitud nombra una herramienta/método específico
  SKILL_FITS_THRESHOLD: 0.3, // En la segunda pasada, el mejor Noul `fits::<name>` debe superar 0.30

  // Puntuación de ajuste de MCP
  MCP_FIT_MIN_NOUL: 0.45,
  MCP_NECESSARY_SCORE: 2.2, // sobre escala 0..3
  MCP_RECOMMENDED_SCORE: 1.4,

  // Auditoría de evidencia e incertidumbre
  CONTRADICTION_ALERT_NOUL: 0.55,
} as const;

// ============================================================================
// 1. Evaluación de Claridad del Brief (Qué está definido vs. qué necesita aclaración)
// ============================================================================

export function buildBriefClarityQuestions() {
  return {
    has_concrete_objective: noul(
      'Does `input.text` state a concrete product or feature goal that a developer can build toward?',
      {
        true: 'The text names a specific product, workflow, or capability to build or improve.',
        false: 'The text is only a vague topic or slogan without stating what the software should do.',
      }
    ),
    has_target_users: noul(
      'Does `input.text` explicitly identify who will use the application or feature?',
      {
        true: 'The text mentions the target user, role, or personal/team usage context.',
        false: 'The text never mentions who the user is or whether it is personal, internal, or public.',
      }
    ),
    has_technical_constraints: noul(
      'Does `input.text` specify technical, operating system, privacy, or budget constraints?',
      {
        true: 'The text states concrete constraints such as Windows/macOS, local execution, specific stack, or budget.',
        false: 'The text leaves platform, hosting, budget, and stack completely open.',
      }
    ),
    has_acceptance_scope: noul(
      'Does `input.text` define the boundaries of the initial version or specific functional requirements?',
      {
        true: 'The text lists specific features, inputs/outputs, or what belongs in the first version.',
        false: 'The text is a single sentence or open idea without feature boundaries.',
      }
    ),
    has_internal_contradictions: noul(
      'Does `input.text` contain conflicting requirements, such as demanding 100% offline execution while requiring live cloud-only SaaS APIs without fallback?',
      {
        true: 'Two or more stated requirements directly conflict with each other.',
        false: 'The stated requirements are mutually compatible.',
      }
    ),
    project_archetype: choice(
      'Which software archetype best matches what the user wants to build in `input.text`?',
      {
        local_web_tool:
          'A personal or developer tool with a web interface and local backend/filesystem access.',
        fullstack_saas:
          'A multi-user web application with authentication, cloud database, and remote deployment.',
        cli_or_automation:
          'A command-line utility, background worker, script, or scheduled automation pipeline.',
        desktop_native:
          'A standalone desktop application requiring native OS windowing or tray integration.',
        existing_repo_feature:
          'An incremental feature, refactor, or integration inside an already existing codebase.',
      }
    ),
  };
}

// ============================================================================
// 2. Cookbook Oficial: Skill Suggestion (2 pasadas encadenadas)
//    Referencia: https://docs.typesafe.ai/cookbooks/skill_suggestion
// ============================================================================

export function buildSkillSuggestionPass1Questions(skillsRoster: CatalogEntry[]) {
  const criteria: Record<string, string> = {};
  for (const skill of skillsRoster) {
    criteria[skill.name] = skill.description.slice(0, 120);
  }

  return {
    which: choice(
      "Which of these skills, if any, is the right one to load to help with the user's project request?",
      criteria
    ),
    'gate::acts_on_user_system': noul(
      "Is the project or agent being asked to act on files, repositories, local clients, or external APIs, rather than only to explain a concept in prose?"
    ),
    'gate::would_follow_documented_procedure': noul(
      'Would a careful engineer building or preparing this project consult a specific documented SDK, protocol, or workflow procedure rather than general knowledge?'
    ),
    'gate::prose_suffices': noul(
      'Could a generalist satisfy this request in plain prose alone, with no tools, no SDKs, and no environment configuration?'
    ),
    named: noul(
      'Does the request ask for or benefit from a specific named tool, protocol (such as MCP), API (such as TypeSafe Jev or REA), or framework?'
    ),
  };
}

export function buildSkillSuggestionPass2Questions(shortlistEntries: CatalogEntry[]) {
  const criteria: Record<string, string> = {};
  for (const entry of shortlistEntries) {
    const excerpt = entry.bodyExcerpt.slice(0, JEV_THRESHOLDS.SKILL_EXCERPT_CHARS);
    criteria[entry.name] = `${entry.descriptionFull} — ${excerpt}`;
  }

  const questions: Record<string, unknown> = {
    which: choice(
      "Which of these candidate skills is the best fit for the user's project? Read what each actually does, not just its name.",
      criteria
    ),
  };

  // Un Noul independiente por candidato para permitir rechazar todos si ninguno encaja realmente
  for (const entry of shortlistEntries) {
    questions[`fits::${entry.name}`] = noul(
      `Does the skill '${entry.name}' directly address a concrete need of the project in \`project\`? It is described as: ${entry.descriptionFull}`,
      {
        true: `The project specifically needs the workflow, API, or capability provided by ${entry.name}.`,
        false: `The skill ${entry.name} is unrelated or unnecessary for this project's goals.`,
      }
    );
  }

  return questions;
}

// ============================================================================
// 3. Evaluación de Ajuste de Capacidades MCP a Requisitos Documentados
// ============================================================================

export function buildMcpFitQuestions(mcpCandidates: CatalogEntry[]) {
  const questions: Record<string, unknown> = {};

  for (const mcp of mcpCandidates) {
    const safeKey = mcp.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    questions[`fit_score::${safeKey}`] = score(
      `How well does the MCP server or tool '${mcp.name}' (${mcp.descriptionFull}) serve the documented requirements in \`project\`?`,
      [
        'Unrelated: the project has no requirement that uses this capability.',
        'Tangential: might be mildly convenient later, but adds unnecessary setup overhead now.',
        'Recommended: directly accelerates development or verification of a stated feature.',
        'Essential: required to fulfill a core requirement or integration explicitly requested.',
      ]
    );
    questions[`solves_need::${safeKey}`] = noul(
      `Does '${mcp.name}' solve a concrete requirement or workflow stated in \`project\`?`,
      {
        true: `'${mcp.name}' covers a specific need in the project brief or preparation workflow.`,
        false: `'${mcp.name}' duplicates another tool or has no clear use in this project.`,
      }
    );
  }

  return questions;
}

// ============================================================================
// 4. Patrón Oficial: Composite Scoring para Comparación de Stacks
//    Referencia: https://docs.typesafe.ai/patterns/composite-scoring
// ============================================================================

export const STACK_DIMENSION_LABELS: Record<StackDimensionKey, string> = {
  functionalFit: 'Encaje funcional',
  buildTime: 'Tiempo de construcción',
  operations: 'Operación',
  cost: 'Costo',
  experience: 'Experiencia',
  integrations: 'Integraciones',
  evolution: 'Evolución',
};

export function buildStackCompositeQuestions(optionId: string, optionName: string, optionSummary: string) {
  return {
    [`${optionId}::functionalFit`]: score(
      `For the project in \`project\`, how well does the stack option '${optionName}' (${optionSummary}) cover the functional requirements?`,
      [
        'Missing critical capabilities required by the project.',
        'Covers basics but needs heavy custom workarounds for core features.',
        'Covers almost all functional requirements with minor standard adaptations.',
        'Directly satisfies all functional, local/remote, and integration requirements natively.',
      ]
    ),
    [`${optionId}::buildTime`]: score(
      `How fast and straightforward is initial construction of \`project\` using '${optionName}' (${optionSummary})?`,
      [
        'Very slow setup with complex build toolchains, native compilation hurdles, or boilerplate.',
        'Moderate setup requiring multiple separate processes or heavy configuration.',
        'Fast setup using standard packages and reusable components.',
        'Immediate productivity with minimal dependencies and built-in runtime capabilities.',
      ]
    ),
    [`${optionId}::operations`]: score(
      `How simple is local execution, hosting, maintenance, and updating for '${optionName}' on the target environment in \`project\`?`,
      [
        'Fragile operation requiring complex daemons, external containers, or enterprise infra.',
        'Requires managing multiple services or manual synchronization steps.',
        'Clean single-command execution and straightforward updates.',
        'Self-contained execution on the target OS with zero external infrastructure maintenance.',
      ]
    ),
    [`${optionId}::cost`]: score(
      `How favorable is the operational and licensing cost of '${optionName}' given the budget constraints in \`project\`?`,
      [
        'Requires paid enterprise tiers or recurring subscriptions that exceed a personal tool budget.',
        'Has variable usage costs that could grow unexpectedly without strict caps.',
        'Free core runtime with optional pay-as-you-go API calls within user control.',
        '100% free open-source runtime and local storage with zero mandatory hosting fees.',
      ]
    ),
    [`${optionId}::experience`]: score(
      `What quality of user interface, responsiveness, and keyboard accessibility does '${optionName}' enable for \`project\`?`,
      [
        'Limited or clunky interface that makes reviewing tables, diffs, and plans difficult.',
        'Basic interface with limited interactivity or slow feedback loops.',
        'Responsive interface with good component support and accessibility.',
        'Rich, fast, accessible interactive UI ideal for comparing options, editing briefs, and inspecting evidence.',
      ]
    ),
    [`${optionId}::integrations`]: score(
      `How well does '${optionName}' integrate with the chosen agent tools, SDKs (TypeSafe Jev, REA), filesystem, and GitHub workflows in \`project\`?`,
      [
        'Sandboxed or incompatible runtime that cannot invoke local CLIs or official SDKs.',
        'Requires bridge workarounds to talk to local agent configs or SDKs.',
        'Compatible with official SDKs and local command execution.',
        'First-class TypeScript/Node integration with `@typesafe-ai/sdk`, REA CLI/MCP, local configs, and Git.',
      ]
    ),
    [`${optionId}::evolution`]: score(
      `How resilient is '${optionName}' regarding vendor lock-in, architectural limits, and future migration paths for \`project\`?`,
      [
        'High lock-in to a proprietary platform with difficult data export.',
        'Coupled to specific framework conventions that require rewriting to migrate.',
        'Standard modular architecture with portable data formats.',
        'Clean separation of UI, domain services, and SQLite/Markdown/JSON storage with zero lock-in.',
      ]
    ),
  };
}

// ============================================================================
// 5. Clasificación de Tareas para Asignación a Roles de Agentes
// ============================================================================

export function buildTaskRoleRoutingQuestions(
  tasks: Array<{ id: string; title: string; description: string }>,
  roleCriteria: Record<string, string>
) {
  const questions: Record<string, unknown> = {};
  for (const task of tasks) {
    questions[`role::${task.id}`] = choice(
      `Which specialized agent role should own the task '${task.title}' (${task.description})?`,
      roleCriteria
    );
    questions[`needs_isolation::${task.id}`] = noul(
      `Does the task '${task.title}' (${task.description}) modify shared configuration or core schema files that require strict sequential ordering before parallel work?`,
      {
        true: 'This task modifies shared contracts, schemas, or environment setup that other tasks depend on.',
        false: 'This task operates on an isolated module or UI view that can run in parallel once contracts exist.',
      }
    );
  }
  return questions;
}

// ============================================================================
// 6. Detección de Evidencia Insuficiente o Contradicciones en Investigación
// ============================================================================

export function buildEvidenceAuditQuestions() {
  return {
    has_primary_sources: noul(
      'Do the collected `evidence` items include primary technical sources (official documentation, verified repositories, or specifications) rather than only secondary summaries?',
      {
        true: 'At least two primary sources with concrete technical details or repo metadata are present.',
        false: 'The evidence consists only of superficial snippets without primary documentation or repo verification.',
      }
    ),
    has_unresolved_contradictions: noul(
      'Do the `evidence` items or `brief` constraints show technical contradictions or compatibility uncertainties that require user review?',
      {
        true: 'There is a tension or uncertainty between a project constraint and one of the researched tools/options.',
        false: 'All researched options and evidence align cleanly with the project constraints.',
      }
    ),
    evidence_sufficiency: score(
      'How sufficient is the collected `evidence` in `state` to justify the stack and tool recommendations for `brief`?',
      [
        'Insufficient: key requirements lack any supporting source or verification.',
        'Partial: covers general concepts but lacks version, license, or compatibility details.',
        'Solid: covers comparable references, stack options, and verified tools with URLs and dates.',
        'Comprehensive: includes verified primary docs, repository commit/license metadata, risks, and REA observations.',
      ]
    ),
  };
}
