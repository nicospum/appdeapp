import {
  saveProject,
  getProjectById,
  listProjects,
  deleteProject,
  getBriefRevisions,
  logExecutionEvent,
} from '../storage/db.js';
import { inspectExistingProject } from './existing-inspector.js';
import { buildInitialProjectBrief } from './brief-builder.js';
import { generateStackComparison, recalculateStackComparisonWeights } from '../stack/stack-comparator.js';
import { generateProjectReaReferenceCards } from '../providers/rea-adapter.js';
import { recommendCapabilitiesForProject, ensureCatalogSeeded } from '../catalog/catalog-service.js';
import {
  buildEnvironmentPreparationPlan,
  applyEnvironmentPreparationPlan,
  revertEnvironmentBackup,
} from '../environment/client-adapters.js';
import {
  buildUxDesignProposal,
  buildAgentRolesAndTasks,
  generateProjectArtifacts,
  applyArtifactsToLocalDirectory,
  prepareGitHubBranchDelivery,
} from './ux-roles-docs-generator.js';
import type {
  ProjectRecord,
  ProjectMode,
  DestinationType,
  PriorityPresetId,
  DimensionWeights,
  SupportedClientId,
} from '../../shared/types.js';

/**
 * Crea un proyecto nuevo o sobre una función existente, ejecutando la primera propuesta
 * completa (brief editable, comparación de stack con Jev, fichas REA, selección de catálogo,
 * diseño UX, roles/tareas y paquete inicial de artefactos).
 */
export async function createFullProject(input: {
  mode: ProjectMode;
  inputRaw: string;
  inputUrls?: string[];
  inputImages?: ProjectRecord['inputImages'];
  existingProjectPath?: string;
  destinationType?: DestinationType;
  localTargetPath?: string;
  githubRepoTarget?: string;
}): Promise<ProjectRecord> {
  const projectId = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();

  const existingInspection =
    input.mode === 'existing_feature' && input.existingProjectPath
      ? inspectExistingProject(input.existingProjectPath, input.inputRaw)
      : undefined;

  const brief = await buildInitialProjectBrief({
    projectId,
    mode: input.mode,
    inputRaw: input.inputRaw,
    inputUrls: input.inputUrls || [],
    existingInspection,
  });

  if (input.inputImages && input.inputImages.length > 0) {
    brief.explicitFacts.push(
      `Imágenes de referencia visual cargadas (${input.inputImages.length}): ${input.inputImages
        .map((img) => `${img.fileName}${img.userNote ? ` ("${img.userNote}")` : ''}`)
        .join(', ')}.`
    );
  }

  const stackComparison = await generateStackComparison(
    projectId,
    brief,
    'balanced',
    undefined,
    existingInspection
  );

  const reaCards = await generateProjectReaReferenceCards(
    projectId,
    brief,
    input.existingProjectPath
  );

  const { selections: capabilitySelections } = await recommendCapabilitiesForProject(
    projectId,
    brief
  );

  const project: ProjectRecord = {
    id: projectId,
    name: brief.title,
    mode: input.mode,
    inputRaw: input.inputRaw,
    inputUrls: input.inputUrls || [],
    inputImages: input.inputImages || [],
    existingProjectPath: input.existingProjectPath,
    existingInspection,
    destinationType: input.destinationType || 'local',
    localTargetPath: input.localTargetPath || input.existingProjectPath,
    githubRepoTarget: input.githubRepoTarget,
    brief,
    researchRuns: [],
    stackComparison,
    reaCards,
    capabilitySelections,
    agentRoles: [],
    tasks: [],
    environmentPlans: [],
    backups: [],
    generatedArtifacts: [],
    githubSyncHistory: [],
    staleSectionsRequiringRevalidation: [],
    createdAt: now,
    updatedAt: now,
  };

  project.uxProposal = buildUxDesignProposal(project);
  const { roles, tasks } = await buildAgentRolesAndTasks(project);
  project.agentRoles = roles;
  project.tasks = tasks;

  const initialPlan = buildEnvironmentPreparationPlan({
    projectId: project.id,
    briefRevision: project.brief.revision,
    targetClients: ['codex', 'cursor', 'claude_code'],
    selections: project.capabilitySelections,
    localDestinationPath: project.localTargetPath,
  });
  project.environmentPlans = [initialPlan];
  project.generatedArtifacts = generateProjectArtifacts(project);

  saveProject(project);
  logExecutionEvent('project_created', 'ok', { projectId, mode: input.mode, title: project.name }, projectId);
  return project;
}

/**
 * Actualiza el brief, responde preguntas o avanza con los supuestos actuales.
 * Incrementa la revisión del brief, actualiza los artefactos dependientes y marca
 * explícitamente qué decisiones o instalaciones requieren revalidación.
 */
export async function updateProjectBrief(
  projectId: string,
  update: {
    title?: string;
    objective?: string;
    targetUsers?: string;
    problemStatement?: string;
    coreFeatures?: string[];
    constraints?: ProjectRecord['brief']['constraints'];
    inferredAssumptions?: ProjectRecord['brief']['inferredAssumptions'];
    clarifyingAnswers?: Array<{
      questionId: string;
      selectedOptionId?: string;
      customAnswer?: string;
    }>;
    mvpScope?: string[];
    futureImprovements?: string[];
    inputImages?: ProjectRecord['inputImages'];
    masterAgentPrompt?: string;
    advanceWithAssumptions?: boolean;
  }
): Promise<ProjectRecord> {
  const project = getProjectById(projectId);
  if (!project) throw new Error(`Proyecto no encontrado: ${projectId}`);

  const prevObjective = project.brief.objective;
  const prevConstraintsJson = JSON.stringify(project.brief.constraints);

  project.brief.revision += 1;
  project.brief.updatedAt = new Date().toISOString();

  if (update.title !== undefined) {
    project.brief.title = update.title;
    project.name = update.title;
  }
  if (update.objective !== undefined) project.brief.objective = update.objective;
  if (update.targetUsers !== undefined) project.brief.targetUsers = update.targetUsers;
  if (update.problemStatement !== undefined) project.brief.problemStatement = update.problemStatement;
  if (update.coreFeatures !== undefined) project.brief.coreFeatures = update.coreFeatures;
  if (update.constraints !== undefined) project.brief.constraints = update.constraints;
  if (update.inferredAssumptions !== undefined) {
    project.brief.inferredAssumptions = update.inferredAssumptions;
  }
  if (update.mvpScope !== undefined) project.brief.mvpScope = update.mvpScope;
  if (update.futureImprovements !== undefined) {
    project.brief.futureImprovements = update.futureImprovements;
  }
  if (update.inputImages !== undefined) {
    project.inputImages = update.inputImages;
  }

  if (update.clarifyingAnswers) {
    for (const ans of update.clarifyingAnswers) {
      const q = project.brief.clarifyingQuestions.find((item) => item.id === ans.questionId);
      if (q) {
        if (ans.selectedOptionId) q.selectedOptionId = ans.selectedOptionId;
        if (ans.customAnswer !== undefined) q.customAnswer = ans.customAnswer;
        q.status = 'answered';
      }
    }
  }

  if (update.advanceWithAssumptions) {
    project.brief.advancedWithAssumptions = true;
    for (const q of project.brief.clarifyingQuestions) {
      if (q.status === 'open') {
        q.status = 'assumed_default';
      }
    }
  }

  const objectiveChanged = project.brief.objective !== prevObjective;
  const constraintsChanged = JSON.stringify(project.brief.constraints) !== prevConstraintsJson;

  if (objectiveChanged || constraintsChanged) {
    // Recalcular comparación de stack frente a nuevas restricciones u objetivo
    project.stackComparison = await generateStackComparison(
      project.id,
      project.brief,
      project.stackComparison?.activePreset || 'balanced',
      project.stackComparison?.weights,
      project.existingInspection
    );

    const staleSet = new Set(project.staleSectionsRequiringRevalidation);
    staleSet.add('research_runs (el objetivo o las restricciones cambiaron desde la última búsqueda)');
    if (project.environmentPlans.some((p) => p.appliedAt)) {
      staleSet.add('environment_preparation (revalidar herramientas instaladas frente a la nueva revisión del brief)');
    }
    project.staleSectionsRequiringRevalidation = Array.from(staleSet);
  }

  project.uxProposal = buildUxDesignProposal(project);
  const { roles, tasks } = await buildAgentRolesAndTasks(project);
  project.agentRoles = roles;
  project.tasks = tasks;
  project.generatedArtifacts = generateProjectArtifacts(project);

  saveProject(project);
  return project;
}

/**
 * Cambia la prioridad o el stack elegido por el usuario, recalculando los puntajes compuestos,
 * regenerando los artefactos afectados y señalando qué requiere nueva preparación.
 */
export async function updateProjectStackDecision(
  projectId: string,
  params: {
    preset?: PriorityPresetId;
    customWeights?: DimensionWeights;
    selectedOptionId?: string;
  }
): Promise<ProjectRecord> {
  const project = getProjectById(projectId);
  if (!project) throw new Error(`Proyecto no encontrado: ${projectId}`);

  if (!project.stackComparison) {
    project.stackComparison = await generateStackComparison(
      project.id,
      project.brief,
      params.preset || 'balanced',
      params.customWeights,
      project.existingInspection
    );
  } else if (params.preset || params.customWeights) {
    project.stackComparison = recalculateStackComparisonWeights(
      project.stackComparison,
      params.preset || project.stackComparison.activePreset,
      params.customWeights
    );
  }

  const prevSelected = project.stackComparison.selectedOptionId;
  if (params.selectedOptionId) {
    const targetOpt = project.stackComparison.options.find((o) => o.id === params.selectedOptionId);
    if (!targetOpt) {
      throw new Error(`Opción de stack no encontrada: ${params.selectedOptionId}`);
    }
    if (targetOpt.disqualifiedByHardConstraint) {
      throw new Error(
        `No se puede elegir "${targetOpt.name}" porque incumple una restricción dura comprobable: ${targetOpt.disqualificationReason}`
      );
    }
    project.stackComparison.selectedOptionId = params.selectedOptionId;
  } else if (params.preset || params.customWeights) {
    project.stackComparison.selectedOptionId = project.stackComparison.recommendedOptionId;
  }

  if (project.stackComparison.selectedOptionId !== prevSelected) {
    project.brief.revision += 1;
    project.brief.updatedAt = new Date().toISOString();
    const stale = new Set(project.staleSectionsRequiringRevalidation);
    stale.add(
      `environment_preparation (el stack cambió de ${prevSelected} a ${project.stackComparison.selectedOptionId}; revalidar dependencias e instalaciones)`
    );
    project.staleSectionsRequiringRevalidation = Array.from(stale);
  }

  const { roles, tasks } = await buildAgentRolesAndTasks(project);
  project.agentRoles = roles;
  project.tasks = tasks;
  project.generatedArtifacts = generateProjectArtifacts(project);

  saveProject(project);
  return project;
}

/**
 * Actualiza qué herramientas del catálogo están seleccionadas para instalar y regenera el plan por cliente.
 */
export function updateProjectCapabilitiesAndPlan(
  projectId: string,
  params: {
    selectedCatalogIds?: string[];
    targetClients?: SupportedClientId[];
    overrideHomeDir?: string;
  }
): ProjectRecord {
  const project = getProjectById(projectId);
  if (!project) throw new Error(`Proyecto no encontrado: ${projectId}`);

  if (params.selectedCatalogIds) {
    const selectedSet = new Set(params.selectedCatalogIds);
    for (const sel of project.capabilitySelections) {
      sel.selectedForInstall = selectedSet.has(sel.catalogId);
    }
  }

  const clients = params.targetClients || project.environmentPlans[0]?.targetClients || ['codex', 'cursor'];
  const newPlan = buildEnvironmentPreparationPlan({
    projectId: project.id,
    briefRevision: project.brief.revision,
    targetClients: clients,
    selections: project.capabilitySelections,
    localDestinationPath: project.localTargetPath,
    overrideHomeDir: params.overrideHomeDir,
  });

  project.environmentPlans.unshift(newPlan);
  project.generatedArtifacts = generateProjectArtifacts(project);
  saveProject(project);
  return project;
}

/**
 * Aplica el plan de preparación en los clientes elegidos y guarda el respaldo reversible.
 */
export async function executeProjectEnvironmentPreparation(
  projectId: string,
  options?: {
    planId?: string;
    overrideHomeDir?: string;
    skipLiveProcessProbe?: boolean;
  }
): Promise<{
  project: ProjectRecord;
  appliedPlanId: string;
  backupId: string;
}> {
  const project = getProjectById(projectId);
  if (!project) throw new Error(`Proyecto no encontrado: ${projectId}`);

  const plan = options?.planId
    ? project.environmentPlans.find((p) => p.id === options.planId)
    : project.environmentPlans[0];

  if (!plan) {
    throw new Error('No hay un plan de preparación generado para este proyecto.');
  }

  const catalogEntries = ensureCatalogSeeded();
  const { updatedPlan, backupRecord } = await applyEnvironmentPreparationPlan({
    plan,
    catalogEntries,
    overrideHomeDir: options?.overrideHomeDir,
    skipLiveProcessProbe: options?.skipLiveProcessProbe,
  });

  project.backups.unshift(backupRecord);
  project.staleSectionsRequiringRevalidation = project.staleSectionsRequiringRevalidation.filter(
    (s) => !s.startsWith('environment_preparation')
  );
  project.generatedArtifacts = generateProjectArtifacts(project);
  saveProject(project);

  logExecutionEvent(
    'environment_prepared',
    'ok',
    { planId: updatedPlan.id, backupId: backupRecord.id, actionsCount: updatedPlan.actions.length },
    project.id
  );

  return {
    project,
    appliedPlanId: updatedPlan.id,
    backupId: backupRecord.id,
  };
}

/**
 * Revierte los cambios aplicados por un respaldo propio sin eliminar configuraciones ni dependencias ajenas.
 */
export function revertProjectEnvironmentPreparation(
  projectId: string,
  backupId?: string
): {
  project: ProjectRecord;
  revertedFiles: string[];
  skippedConcurrentNotes: string[];
} {
  const project = getProjectById(projectId);
  if (!project) throw new Error(`Proyecto no encontrado: ${projectId}`);

  const backup = backupId
    ? project.backups.find((b) => b.id === backupId)
    : project.backups.find((b) => !b.revertedAt);

  if (!backup) {
    throw new Error('No se encontró un respaldo activo para revertir.');
  }

  const { revertedFiles, skippedConcurrentNotes } = revertEnvironmentBackup(backup);
  const matchingPlan = project.environmentPlans.find((p) => p.id === backup.planId);
  if (matchingPlan) {
    for (const act of matchingPlan.actions) {
      act.stage = 'selected';
      act.verificationDetail = 'Cambios propios revertidos limpiamente mediante snapshot.';
    }
  }

  project.generatedArtifacts = generateProjectArtifacts(project);
  saveProject(project);

  logExecutionEvent('environment_reverted', 'ok', { backupId: backup.id, revertedFiles }, project.id);

  return { project, revertedFiles, skippedConcurrentNotes };
}

export {
  getProjectById,
  listProjects,
  deleteProject,
  getBriefRevisions,
  applyArtifactsToLocalDirectory,
  prepareGitHubBranchDelivery,
};
