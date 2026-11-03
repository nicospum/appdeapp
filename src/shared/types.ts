import { z } from 'zod';

// ============================================================================
// 1. Modos del Proyecto y Entrada Central
// ============================================================================

export type ProjectMode = 'new_project' | 'existing_feature';
export type ResearchDepth = 'fast' | 'normal' | 'deep';
export type DestinationType = 'local' | 'github' | 'both';

export interface ExistingProjectInspection {
  rootPath: string;
  exists: boolean;
  detectedStack: string[];
  architectureSummary: string;
  conventions: string[];
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  testFrameworks: string[];
  testScripts: Record<string, string>;
  keyFiles: string[];
  gitStatus?: {
    isRepo: boolean;
    branch?: string;
    headCommit?: string;
    hasUncommittedChanges?: boolean;
    remoteUrl?: string;
  };
  minimalChangeProposal: {
    summary: string;
    filesToTouch: string[];
    filesToCreate: string[];
    stackPreserved: boolean;
    stackChangeJustification?: string;
    compatibilityNotes: string[];
  };
  inspectedAt: string;
}

// ============================================================================
// 2. Brief Editable, Supuestos y Preguntas de Alto Impacto
// ============================================================================

export interface InferredAssumption {
  id: string;
  statement: string;
  rationale: string;
  category: 'scope' | 'architecture' | 'cost' | 'ux' | 'environment';
  accepted: boolean;
  editedByUser?: boolean;
}

export interface ClarifyingOption {
  id: string;
  label: string;
  impactOnProject: string;
  recommended: boolean;
}

export interface ClarifyingQuestion {
  id: string;
  area: 'scope' | 'architecture' | 'cost' | 'ux';
  question: string;
  whyItMatters: string;
  options: ClarifyingOption[];
  selectedOptionId?: string;
  customAnswer?: string;
  status: 'open' | 'answered' | 'assumed_default';
}

export interface ProjectConstraints {
  targetOs: string;
  budgetLimit: string;
  executionMode: 'local_only' | 'hybrid' | 'cloud';
  privacyLevel: 'strict_local' | 'standard_api' | 'cloud_managed';
  lockedTechnologies: string[];
  forbiddenTechnologies: string[];
  timelineExpectation: string;
}

export interface ProjectBrief {
  revision: number;
  updatedAt: string;
  title: string;
  objective: string;
  targetUsers: string;
  problemStatement: string;
  coreFeatures: string[];
  constraints: ProjectConstraints;
  explicitFacts: string[];
  inferredAssumptions: InferredAssumption[];
  clarifyingQuestions: ClarifyingQuestion[]; // UI highlights max 2 open questions per turn
  mvpScope: string[];
  futureImprovements: string[];
  contradictionsDetected: string[];
  advancedWithAssumptions: boolean;
}

// ============================================================================
// 3. Investigación Profunda y Evidencia Comprobable
// ============================================================================

export type EvidenceCategory =
  | 'comparable_app'
  | 'open_source_repo'
  | 'tech_option'
  | 'mcp_skill_tool'
  | 'ux_design_resource'
  | 'technical_risk'
  | 'community_x';

export type EvidenceSourceType =
  | 'official_docs'
  | 'github_repo'
  | 'mcp_registry'
  | 'web_primary'
  | 'x_api'
  | 'x_public_indexed'
  | 'local_inspection';

export interface GitHubRepoMetadata {
  fullName: string;
  versionOrCommit: string;
  license: string;
  lastPushedAt: string;
  maintenanceStatus: 'active' | 'maintained' | 'stale' | 'archived' | 'unknown';
  requirements: string[];
  knownLimits: string[];
  starsCount?: number;
  starsNote: string; // Always clarifies that popularity/stars orient discovery but don't prove compatibility
}

export interface EvidenceItem {
  id: string;
  title: string;
  url: string;
  consultedAt: string;
  sourceType: EvidenceSourceType;
  category: EvidenceCategory;
  summary: string;
  rawEvidenceExcerpt: string;
  projectNeedRelation: string;
  contradictionsOrUncertainties?: string;
  repoMetadata?: GitHubRepoMetadata;
  verifiedPrimarySource: boolean;
  cachedFromRunId?: string;
}

export type ResearchRunStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'cancelled'
  | 'completed'
  | 'failed';

export type XCoverageStatus =
  | 'authorized_api'
  | 'public_indexed_only'
  | 'pending_no_access';

export interface ResearchBudget {
  maxDurationSeconds: number;
  maxNetworkRequests: number;
  maxTokens: number;
}

export interface ResearchStepLog {
  stepIndex: number;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'skipped_cached' | 'failed';
  startedAt?: string;
  completedAt?: string;
  detail: string;
  itemsFound: number;
}

export interface ResearchRun {
  id: string;
  projectId: string;
  briefRevision: number;
  depth: ResearchDepth;
  purpose: string;
  questions: string[];
  budget: ResearchBudget;
  completionCriteria: string;
  status: ResearchRunStatus;
  xCoverageStatus: XCoverageStatus;
  xCoverageNote: string;
  steps: ResearchStepLog[];
  completedSteps: number;
  totalSteps: number;
  currentStepLabel: string;
  elapsedMs: number;
  requestsUsed: number;
  reusedCachedCount: number;
  evidenceItems: EvidenceItem[];
  conclusions: string[];
  openUncertainties: string[];
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
}

// ============================================================================
// 4. Comparación de Tecnologías y Elección del Stack
// ============================================================================

export type StackDimensionKey =
  | 'functionalFit'
  | 'buildTime'
  | 'operations'
  | 'cost'
  | 'experience'
  | 'integrations'
  | 'evolution';

export interface StackDimensionEvaluation {
  dimension: StackDimensionKey;
  label: string;
  scoreNormalized: number; // 0 to 1
  rawScoreLevel: number; // 0 to 3
  confidence?: number;
  explanation: string;
  evidenceUrls: string[];
}

export interface HardConstraintCheck {
  constraintName: string;
  passed: boolean;
  reason: string;
}

export interface CostEstimate {
  monthlyRangeUsd: string;
  isUnknownPrice: boolean;
  assumptions: string[];
  requiredServices: string[];
  sourceUrl: string;
  note: string;
}

export interface StackOption {
  id: string;
  name: string;
  tagline: string;
  components: {
    frontend: string;
    backend: string;
    storage: string;
    runtime: string;
    packaging: string;
  };
  hardConstraints: HardConstraintCheck[];
  disqualifiedByHardConstraint: boolean;
  disqualificationReason?: string;
  dimensions: Record<StackDimensionKey, StackDimensionEvaluation>;
  costEstimate: CostEstimate;
  weightedScore: number; // 0 to 100, computed deterministically in code
  whenToPreferThis: string;
  tradeoffs: string[];
}

export type PriorityPresetId =
  | 'balanced'
  | 'speed'
  | 'low_cost'
  | 'local_first'
  | 'privacy'
  | 'design_ux'
  | 'maintainability';

export type DimensionWeights = Record<StackDimensionKey, number>;

export interface StackComparison {
  briefRevision: number;
  updatedAt: string;
  activePreset: PriorityPresetId;
  weights: DimensionWeights;
  options: StackOption[];
  recommendedOptionId: string;
  selectedOptionId: string;
  recommendationRationale: string;
  prioritySensitivityExplanation: string; // Explains what priority change would flip the winner
  jevEvaluationId?: string;
}

// ============================================================================
// 5. Jev de TypeSafe: Evaluaciones Tipadas Estructuradas
// ============================================================================

export type JevUseCase =
  | 'brief_clarity'
  | 'skill_suggestion'
  | 'mcp_fit'
  | 'stack_dimensions'
  | 'task_role_routing'
  | 'evidence_contradiction_check'
  | 'connection_probe';

export interface JevAnswerSummary {
  questionKey: string;
  type: 'noul' | 'choice' | 'score';
  value: number | string;
  confidence?: number; // Present on Choice and Score; absent on Noul per TypeSafe spec
  probabilities?: Record<string, number>;
  legend?: Record<string, unknown>;
  interpretationNote: string;
}

export interface JevEvaluationRecord {
  id: string;
  projectId?: string;
  useCase: JevUseCase;
  evaluationVersion: string;
  modelRequested: string;
  modelUsed: string;
  chainedStep?: number;
  parentEvaluationId?: string;
  criteriaSummary: Record<string, unknown>;
  answers: Record<string, JevAnswerSummary>;
  compositeResult?: Record<string, unknown>;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  latencyMs: number;
  status: 'success' | 'auth_error' | 'quota_error' | 'network_error' | 'validation_error';
  errorMessage?: string;
  createdAt: string;
}

// ============================================================================
// 6. REA (Reverse Engineer Anything): Fichas de Referencia
// ============================================================================

export interface ReaReferenceCard {
  id: string;
  projectId: string;
  targetName: string;
  targetPathOrUrl: string;
  projectNeed: string;
  observedFeature: string;
  toolUsed: string; // e.g., 'rea:analyze_javascript_application', 'rea:inspect_sqlite_database', 'rea:binary_session'
  reaPackageVersion: string;
  evidenceId?: string;
  artifactSha256?: string;
  epistemic: {
    observations: string[]; // Direct static/artifact observations
    inferences: string[]; // Inferred structure/flows (never claiming backend implementation from frontend alone)
    verifiedReproductions: string[]; //Actually executed/verified probes
  };
  analysisLimits: string[];
  reusablePatternOrCode: string;
  requiredAdaptations: string[];
  decision: 'adopt' | 'adapt' | 'discard';
  decisionRationale: string;
  licenseAndAttribution: {
    sourceLicense: string;
    provenanceUrl: string;
    attributionRequired: string;
    reaLicenseDisclaimer: string; // Explicit note: REA license does not grant rights over analyzed target apps
  };
  createdAt: string;
}

export interface ReaSystemStatus {
  cliInstalled: boolean;
  cliVersion: string | null;
  expectedSkillVersion: string | null;
  installedSkillVersion: string | null;
  skillAligned: boolean;
  mcpConnectedInActiveHost: boolean;
  clientRegistrations: Array<{
    client: string;
    configPath: string;
    state: 'aligned' | 'stale' | 'missing' | 'manual';
    remediation: string | null;
  }>;
  availableTargetFreeCapabilities: string[];
  checkedAt: string;
}

// ============================================================================
// 7. Catálogo y Selección de MCP, Skills y Herramientas
// ============================================================================

export type CapabilityKind =
  | 'skill'
  | 'mcp'
  | 'cli_tool'
  | 'library_template'
  | 'design_reference';

export type CapabilityClassification =
  | 'necessary'
  | 'recommended'
  | 'optional'
  | 'discarded';

export type CapabilityScopeCategory =
  | 'app_runtime_dependency' // Dependency of the future app itself
  | 'dev_time_tool'; // Used only by agents/developers while building the app

export interface CatalogEntry {
  id: string;
  name: string;
  kind: CapabilityKind;
  category: string;
  description: string; // Short index description
  descriptionFull: string; // Complete description for Jev 2nd pass
  bodyExcerpt: string; // Excerpt of SKILL.md or MCP capabilities
  solvesNeed: string;
  whyProposedDefault: string;
  requirements: string[];
  authRequired: string;
  compatibleEnvironments: string[];
  license: string;
  version: string;
  knownCost: string;
  sourceUrl: string;
  originType: 'official_registry' | 'author_repo' | 'local_custom' | 'verified_docs';
  scopeCategory: CapabilityScopeCategory;
  overlapGroup?: string; // Used to detect overlapping tools (e.g., two spec frameworks or two search MCPs)
  mcpConfigTemplate?: {
    transport: 'stdio' | 'http' | 'sse';
    command?: string;
    args?: string[];
    url?: string;
    requiredEnvVars?: string[];
  };
  skillMetadata?: {
    directoryPath?: string;
    hasScripts: boolean;
    hasReferences: boolean;
    frontmatterValid: boolean;
  };
  verifiedStructure: boolean;
  validationNotes: string[];
}

export interface ProjectCapabilitySelection {
  catalogId: string;
  entry: CatalogEntry;
  classification: CapabilityClassification;
  classificationReason: string;
  selectedForInstall: boolean;
  overlapWarning?: string;
  jevFitScore?: number;
  jevSuggestedWinner?: boolean;
}

// ============================================================================
// 8. Adaptadores por Cliente y Preparación del Entorno
// ============================================================================

export type SupportedClientId =
  | 'codex'
  | 'claude_code'
  | 'cursor'
  | 'opencode'
  | 'antigravity'
  | 'manual_export';

export type ReadinessStage =
  | 'recommended'
  | 'selected'
  | 'installed_configured'
  | 'recognized_by_client'
  | 'tested_verified'
  | 'pending_verification';

export interface ClientAdapterInfo {
  clientId: SupportedClientId;
  displayName: string;
  detectedOnPc: boolean;
  executablePath: string | null;
  version: string | null;
  configFilePath: string;
  configFormat: 'toml' | 'json' | 'jsonc' | 'export_only';
  skillsDirectoryPath: string | null;
  executionEnvironment: 'local_pc' | 'remote_or_cloud';
  supportedOperations: {
    installSkill: boolean;
    configureMcp: boolean;
    verifyConfigSyntax: boolean;
    probeMcpConnection: boolean;
    revertOwnChanges: boolean;
    automaticSyncToRemote: boolean;
  };
  existingMcpServers: string[];
  existingSkills: string[];
}

export interface PlannedEnvironmentAction {
  id: string;
  clientId: SupportedClientId;
  capabilityId: string;
  capabilityName: string;
  kind: 'skill_copy' | 'mcp_register' | 'project_manifest_write';
  targetPath: string;
  version: string;
  operationSummary: string;
  stage: ReadinessStage;
  verificationDetail?: string;
  pendingInstruction?: string;
}

export interface EnvironmentPreparationPlan {
  id: string;
  projectId: string;
  briefRevision: number;
  targetClients: SupportedClientId[];
  localDestinationPath?: string;
  actions: PlannedEnvironmentAction[];
  permissionsScope: {
    projectDirectoryWrite: boolean;
    clientConfigModify: boolean;
    skillDirectoryWrite: boolean;
    networkProbeAllowed: boolean;
    explicitUserApproved: boolean;
  };
  createdAt: string;
  appliedAt?: string;
  backupManifestId?: string;
}

export interface AppliedBackupRecord {
  id: string;
  projectId: string;
  planId: string;
  createdAt: string;
  revertedAt?: string;
  filesSnapshot: Array<{
    filePath: string;
    existedBefore: boolean;
    sha256Before: string | null;
    contentBefore: string | null;
    sha256After: string;
    addedKeysOrPaths: string[];
  }>;
}

// ============================================================================
// 9. Diseño UX/UI, Roles de Agentes, Documentación y Destinos
// ============================================================================

export interface UxDesignProposal {
  navigationArchitecture: string;
  keyScreens: Array<{
    id: string;
    name: string;
    purpose: string;
    primaryActions: string[];
    states: {
      empty: string;
      loading: string;
      errorAndRecovery: string;
    };
  }>;
  interactiveWireframeHtml: string; // Small, editable HTML/CSS wireframe preview for the future project
  designResources: Array<{
    name: string;
    type: 'design_system' | 'component_library' | 'interaction_pattern' | 'prototyping' | 'a11y_testing';
    contribution: string;
    integrationMode: 'mcp' | 'export' | 'manual';
    sourceUrl: string;
  }>;
  accessibilityChecklist: string[];
}

export interface AgentRoleTask {
  id: string;
  title: string;
  roleId: string;
  description: string;
  dependencies: string[]; // Task IDs that must finish before this starts
  ownedFilesScope: string[]; // Explicit file paths/globs to prevent simultaneous write conflicts
  acceptanceCriteria: string[];
  priority: 'P0' | 'P1' | 'P2';
  status: 'pending' | 'ready_to_transfer' | 'transferred';
}

export interface AgentRoleSpec {
  id: string;
  title: string;
  objective: string;
  inputs: string[];
  selectedToolsAndSkills: string[];
  deliverable: string;
  reviewCriteria: string[];
  readyPromptForAgent: string;
}

export interface GeneratedArtifactFile {
  relativePath: string;
  artifactCategory:
    | 'brief_scope'
    | 'research'
    | 'technical_decisions'
    | 'design_ux'
    | 'work_plan'
    | 'environment_prep'
    | 'agent_instructions'
    | 'manifest_json';
  title: string;
  content: string;
  sourceBriefRevision: number;
  sha256: string;
  generatedAt: string;
  manualEditDetected?: boolean;
  diffWithDisk?: string;
}

export interface GitHubSyncResult {
  status: 'pushed_branch' | 'prepared_local_branch_pending_remote' | 'conflict_detected' | 'blocked_no_credentials';
  repoUrl?: string;
  branchName: string;
  baseCommitSha?: string;
  newCommitSha?: string;
  pullRequestUrl?: string;
  filesCommitted: string[];
  secretsScanPassed: boolean;
  remoteRunnerVerified: boolean;
  executionPendingNote: string;
  message: string;
  timestamp: string;
}

// ============================================================================
// 10. Entidad Principal del Proyecto Persistido
// ============================================================================

export interface ProjectRecord {
  id: string;
  name: string;
  mode: ProjectMode;
  inputRaw: string;
  inputUrls: string[];
  existingProjectPath?: string;
  existingInspection?: ExistingProjectInspection;
  destinationType: DestinationType;
  localTargetPath?: string;
  githubRepoTarget?: string;
  brief: ProjectBrief;
  researchRuns: ResearchRun[];
  stackComparison?: StackComparison;
  reaCards: ReaReferenceCard[];
  capabilitySelections: ProjectCapabilitySelection[];
  uxProposal?: UxDesignProposal;
  agentRoles: AgentRoleSpec[];
  tasks: AgentRoleTask[];
  environmentPlans: EnvironmentPreparationPlan[];
  backups: AppliedBackupRecord[];
  generatedArtifacts: GeneratedArtifactFile[];
  githubSyncHistory: GitHubSyncResult[];
  staleSectionsRequiringRevalidation: string[]; // Marked when brief or stack changes!
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// 11. Estado de Conexiones y Proveedores (Sin exponer secretos)
// ============================================================================

export interface ProviderConnectionStatus {
  provider: 'typesafe' | 'generative_llm' | 'github' | 'x_api' | 'rea_local';
  displayName: string;
  configured: boolean;
  sourceScope: 'process_env' | 'windows_user_env' | 'local_secret_store' | 'none';
  maskedHint: string | null; // e.g., "•••• (107 chars)" - never the raw key
  lastVerifiedAt?: string;
  lastVerificationStatus?: 'ok' | 'error' | 'untested';
  availableModels?: Array<{ name: string; description: string; releaseDate: string }>;
  statusMessage: string;
}

// Esquemas Zod para validación de entradas en endpoints de API
export const CreateProjectInputSchema = z.object({
  mode: z.enum(['new_project', 'existing_feature']),
  inputRaw: z.string().min(3, 'Ingresá al menos una frase o descripción.'),
  inputUrls: z.array(z.string()).optional().default([]),
  existingProjectPath: z.string().optional(),
  destinationType: z.enum(['local', 'github', 'both']).optional().default('local'),
  localTargetPath: z.string().optional(),
  githubRepoTarget: z.string().optional(),
});

export const UpdateBriefInputSchema = z.object({
  title: z.string().optional(),
  objective: z.string().optional(),
  targetUsers: z.string().optional(),
  problemStatement: z.string().optional(),
  coreFeatures: z.array(z.string()).optional(),
  constraints: z
    .object({
      targetOs: z.string(),
      budgetLimit: z.string(),
      executionMode: z.enum(['local_only', 'hybrid', 'cloud']),
      privacyLevel: z.enum(['strict_local', 'standard_api', 'cloud_managed']),
      lockedTechnologies: z.array(z.string()),
      forbiddenTechnologies: z.array(z.string()),
      timelineExpectation: z.string(),
    })
    .optional(),
  inferredAssumptions: z
    .array(
      z.object({
        id: z.string(),
        statement: z.string(),
        rationale: z.string(),
        category: z.enum(['scope', 'architecture', 'cost', 'ux', 'environment']),
        accepted: z.boolean(),
        editedByUser: z.boolean().optional(),
      })
    )
    .optional(),
  clarifyingAnswers: z
    .array(
      z.object({
        questionId: z.string(),
        selectedOptionId: z.string().optional(),
        customAnswer: z.string().optional(),
      })
    )
    .optional(),
  mvpScope: z.array(z.string()).optional(),
  futureImprovements: z.array(z.string()).optional(),
  advanceWithAssumptions: z.boolean().optional(),
});

export const StartResearchInputSchema = z.object({
  depth: z.enum(['fast', 'normal', 'deep']).default('normal'),
  purpose: z.string().optional(),
  customQuestions: z.array(z.string()).optional(),
  maxDurationSeconds: z.number().min(5).max(600).optional(),
  maxNetworkRequests: z.number().min(2).max(100).optional(),
  reuseCache: z.boolean().optional().default(true),
});

export const AddCatalogCustomItemSchema = z.object({
  name: z.string().min(2),
  kind: z.enum(['skill', 'mcp', 'cli_tool', 'library_template', 'design_reference']),
  sourceUrlOrPath: z.string().min(3),
  description: z.string().min(5),
  solvesNeed: z.string().min(3),
  scopeCategory: z.enum(['app_runtime_dependency', 'dev_time_tool']).default('dev_time_tool'),
  license: z.string().optional().default('MIT'),
  mcpTransport: z.enum(['stdio', 'http', 'sse']).optional(),
  mcpCommand: z.string().optional(),
  mcpArgs: z.array(z.string()).optional(),
});
