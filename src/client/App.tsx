import React, { useEffect, useState } from 'react';
import type {
  ProjectRecord,
  ProviderConnectionStatus,
  CatalogEntry,
  ClientAdapterInfo,
  PriorityPresetId,
  ResearchDepth,
  ProjectMode,
  DestinationType,
  SupportedClientId,
  ExistingProjectInspection,
  JevEvaluationRecord,
  CapabilityKind,
  ReadinessStage,
  StackDimensionKey,
} from '../shared/types.js';

type ActiveMainView = 'intake' | 'project' | 'connections';
type ProjectTab = 'brief' | 'research' | 'stack' | 'environment' | 'docs';

interface OptimizerOwnStackDecision {
  title: string;
  chosenStack: string[];
  rationale: string;
  separationPrinciple: string;
}

type BriefRevisionItem = ProjectRecord['brief'];

const PRESET_LABELS: Record<PriorityPresetId, { label: string; desc: string }> = {
  balanced: { label: 'Equilibrado', desc: 'Balance general entre encaje, tiempo y operación' },
  speed: { label: 'Rapidez de entrega', desc: 'Prioriza menor tiempo de construcción y plantillas listas' },
  low_cost: { label: 'Mínimo costo', desc: 'Prioriza $0/mes y operación sin servicios pagos' },
  local_first: { label: 'Funcionamiento local', desc: 'Prioriza ejecución 100% local y datos en disco propio' },
  privacy: { label: 'Privacidad estricta', desc: 'Evita telemetría externa y dependencias en la nube' },
  design_ux: { label: 'Diseño y UX', desc: 'Prioriza calidad visual, accesibilidad e interacción fluida' },
  maintainability: { label: 'Fácil mantenimiento', desc: 'Prioriza simplicidad operativa y evolución limpia' },
};

const READINESS_LABELS: Record<ReadinessStage, { label: string; badgeClass: string }> = {
  recommended: { label: '1. Recomendado', badgeClass: 'badge-neutral' },
  selected: { label: '2. Seleccionado', badgeClass: 'badge-info' },
  installed_configured: { label: '3. Instalado / Configurado', badgeClass: 'badge-warning' },
  recognized_by_client: { label: '4. Reconocido por el cliente', badgeClass: 'badge-info' },
  tested_verified: { label: '5. Probado y Verificado', badgeClass: 'badge-success' },
  pending_verification: { label: '4b. Pendiente de verificación externa', badgeClass: 'badge-warning' },
};

const DIMENSION_LABELS: Record<StackDimensionKey, string> = {
  functionalFit: 'Encaje funcional',
  buildTime: 'Tiempo de construcción',
  operations: 'Operación',
  cost: 'Costo',
  experience: 'Experiencia (UX/UI)',
  integrations: 'Integraciones',
  evolution: 'Evolución',
};

export function App() {
  const [mainView, setMainView] = useState<ActiveMainView>('intake');
  const [activeTab, setActiveTab] = useState<ProjectTab>('brief');

  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [currentProject, setCurrentProject] = useState<ProjectRecord | null>(null);
  const [revisions, setRevisions] = useState<BriefRevisionItem[]>([]);
  const [jevEvaluations, setJevEvaluations] = useState<JevEvaluationRecord[]>([]);

  const [connections, setConnections] = useState<ProviderConnectionStatus[]>([]);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [clients, setClients] = useState<ClientAdapterInfo[]>([]);
  const [ownStackDecision, setOwnStackDecision] = useState<OptimizerOwnStackDecision | null>(null);

  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Estado del formulario de entrada ("¿Qué querés construir o mejorar?")
  const [intakeMode, setIntakeMode] = useState<ProjectMode>('new_project');
  const [intakeText, setIntakeText] = useState<string>('');
  const [intakeLocalPath, setIntakeLocalPath] = useState<string>('');
  const [intakeUrls, setIntakeUrls] = useState<string>('');
  const [intakeDestination, setIntakeDestination] = useState<DestinationType>('local');
  const [intakeGithubTarget, setIntakeGithubTarget] = useState<string>('');
  const [folderInspectionPreview, setFolderInspectionPreview] = useState<ExistingProjectInspection | null>(null);

  // Estado de edición en Tab 1 (Brief)
  const [editTitle, setEditTitle] = useState<string>('');
  const [editObjective, setEditObjective] = useState<string>('');
  const [editProblem, setEditProblem] = useState<string>('');
  const [editUsers, setEditUsers] = useState<string>('');
  const [editMvpFeatures, setEditMvpFeatures] = useState<string>('');
  const [editFutureFeatures, setEditFutureFeatures] = useState<string>('');
  const [questionOptionSelections, setQuestionOptionSelections] = useState<Record<string, string>>({});

  // Estado de Tab 2 (Investigación y REA)
  const [researchDepth, setResearchDepth] = useState<ResearchDepth>('normal');
  const [researchDurationSeconds, setResearchDurationSeconds] = useState<number>(45);
  const [researchMaxRequests, setResearchMaxRequests] = useState<number>(15);
  const [evidenceFilter, setEvidenceFilter] = useState<string>('all');
  const [reaTargetInput, setReaTargetInput] = useState<string>('c:\\Users\\User\\Desktop\\spum\\AI Studio Pro');
  const [reaNeedInput, setReaNeedInput] = useState<string>(
    'Estudiar organización modular, manejo de estados e interfaz sin dependencias pesadas.'
  );

  // Estado de Tab 4 (Catálogo y Entorno)
  const [catalogKindFilter, setCatalogKindFilter] = useState<CapabilityKind | 'all'>('all');
  const [catalogSearch, setCatalogSearch] = useState<string>('');
  const [selectedCatalogIds, setSelectedCatalogIds] = useState<string[]>([]);
  const [selectedTargetClients, setSelectedTargetClients] = useState<SupportedClientId[]>([
    'codex',
    'cursor',
    'claude_code',
  ]);
  const [envExecutionNotes, setEnvExecutionNotes] = useState<string[]>([]);
  const [showNewCatalogForm, setShowNewCatalogForm] = useState<boolean>(false);
  const [newCatName, setNewCatName] = useState<string>('');
  const [newCatKind, setNewCatKind] = useState<CapabilityKind>('skill');
  const [newCatDesc, setNewCatDesc] = useState<string>('');
  const [newCatSolves, setNewCatSolves] = useState<string>('');
  const [newCatUrl, setNewCatUrl] = useState<string>('');

  // Estado de Tab 5 (Documentación y Entrega)
  const [selectedArtifactIndex, setSelectedArtifactIndex] = useState<number>(0);
  const [exportDirectoryInput, setExportDirectoryInput] = useState<string>('');
  const [gitBranchInput, setGitBranchInput] = useState<string>('');
  const [localExportStatus, setLocalExportStatus] = useState<{
    writtenFiles: string[];
    preservedManualFiles: Array<{ relativePath: string; diff: string }>;
  } | null>(null);
  const [gitSyncStatus, setGitSyncStatus] = useState<ProjectRecord['githubSyncHistory'][number] | null>(null);

  // Estado de Conexiones
  const [secretInputs, setSecretInputs] = useState<Record<string, string>>({});
  const [probeResponseDetail, setProbeResponseDetail] = useState<string | null>(null);

  function notifyToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4500);
  }

  async function loadInitialData() {
    try {
      const [healthRes, projRes, connRes, catRes, cliRes, jevRes] = await Promise.all([
        fetch('/api/health').then((r) => r.json()),
        fetch('/api/projects').then((r) => r.json()),
        fetch('/api/connections').then((r) => r.json()),
        fetch('/api/catalog').then((r) => r.json()),
        fetch('/api/clients').then((r) => r.json()),
        fetch('/api/jev/evaluations').then((r) => r.json()),
      ]);

      if (healthRes.optimizerStackDecision) {
        setOwnStackDecision(healthRes.optimizerStackDecision);
      }
      if (Array.isArray(projRes.projects)) {
        setProjects(projRes.projects);
      }
      if (Array.isArray(connRes.connections)) {
        setConnections(connRes.connections);
      }
      if (Array.isArray(catRes.entries)) {
        setCatalog(catRes.entries);
      }
      if (Array.isArray(cliRes.clients)) {
        setClients(cliRes.clients);
      }
      if (Array.isArray(jevRes.evaluations)) {
        setJevEvaluations(jevRes.evaluations);
      }
    } catch (err) {
      setErrorBanner(
        `No se pudo cargar el estado inicial del servidor: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  useEffect(() => {
    void loadInitialData();
  }, []);

  function syncProjectToLocalState(project: ProjectRecord, projectRevisions?: BriefRevisionItem[]) {
    setCurrentProject(project);
    setEditTitle(project.brief.title);
    setEditObjective(project.brief.objective);
    setEditProblem(project.brief.problemStatement);
    setEditUsers(project.brief.targetUsers);
    setEditMvpFeatures(project.brief.mvpScope.join('\n'));
    setEditFutureFeatures(project.brief.futureImprovements.join('\n'));

    const initialAnswers: Record<string, string> = {};
    for (const q of project.brief.clarifyingQuestions) {
      const recOpt = q.options.find((o) => o.recommended) || q.options[0];
      initialAnswers[q.id] = q.selectedOptionId || recOpt?.id || '';
    }
    setQuestionOptionSelections(initialAnswers);

    const installedIds = project.capabilitySelections
      .filter((s) => s.selectedForInstall)
      .map((s) => s.catalogId);
    setSelectedCatalogIds(installedIds);

    if (project.environmentPlans.length > 0) {
      setSelectedTargetClients(project.environmentPlans[0].targetClients);
    }

    setExportDirectoryInput(
      project.localTargetPath || `c:\\Users\\User\\Desktop\\spum\\app de apps\\.data\\exports\\${project.id}`
    );
    setGitBranchInput(`forja/preparacion-rev${project.brief.revision}`);
    if (project.existingProjectPath) {
      setReaTargetInput(project.existingProjectPath);
    }
    if (projectRevisions) {
      setRevisions(projectRevisions);
    }
  }

  async function selectProject(projectId: string) {
    setLoadingMessage('Cargando proyecto, historial de revisiones y evaluaciones...');
    setErrorBanner(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al cargar proyecto');
      syncProjectToLocalState(data.project, data.revisions || []);
      if (Array.isArray(data.jevEvaluations)) {
        setJevEvaluations(data.jevEvaluations);
      }
      setMainView('project');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMessage(null);
    }
  }

  async function handleInspectFolderPreview() {
    if (!intakeLocalPath.trim()) {
      setErrorBanner('Ingresá una ruta de carpeta local para inspeccionar.');
      return;
    }
    setLoadingMessage('Inspeccionando arquitectura, convenciones y pruebas del proyecto existente...');
    setErrorBanner(null);
    try {
      const res = await fetch('/api/inspect-directory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: intakeLocalPath.trim(),
          featureText: intakeText.trim() || 'Agregar o mejorar funcionalidad manteniendo convenciones',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al inspeccionar carpeta');
      setFolderInspectionPreview(data.inspection);
      notifyToast('Inspección de carpeta completada.');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMessage(null);
    }
  }

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!intakeText.trim() || intakeText.trim().length < 3) {
      setErrorBanner('Por favor escribí qué querés construir o mejorar (al menos una frase breve).');
      return;
    }
    setLoadingMessage(
      'Analizando entrada, evaluando claridad con Jev, comparando stacks y preparando propuesta...'
    );
    setErrorBanner(null);
    try {
      const inputUrls = intakeUrls
        .split(/[\n,]/)
        .map((u) => u.trim())
        .filter(Boolean);
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: intakeMode,
          inputRaw: intakeText.trim(),
          inputUrls,
          existingProjectPath: intakeLocalPath.trim() || undefined,
          destinationType: intakeDestination,
          localTargetPath: intakeLocalPath.trim() || undefined,
          githubRepoTarget: intakeGithubTarget.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo crear el proyecto');

      await loadInitialData();
      await selectProject(data.project.id);
      setActiveTab('brief');
      notifyToast('Propuesta inicial generada y guardada en SQLite.');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMessage(null);
    }
  }

  async function handleUpdateBrief(advanceWithAssumptions: boolean) {
    if (!currentProject) return;
    setLoadingMessage(
      advanceWithAssumptions
        ? 'Avanzando con los supuestos recomendados y actualizando artefactos...'
        : 'Guardando cambios del brief, reevaluando y sincronizando artefactos...'
    );
    setErrorBanner(null);
    try {
      const clarifyingAnswers = Object.entries(questionOptionSelections).map(([questionId, selectedOptionId]) => ({
        questionId,
        selectedOptionId,
      }));
      const res = await fetch(`/api/projects/${encodeURIComponent(currentProject.id)}/brief`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim() || undefined,
          objective: editObjective.trim(),
          problemStatement: editProblem.trim(),
          targetUsers: editUsers.trim(),
          mvpScope: editMvpFeatures
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
          futureImprovements: editFutureFeatures
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
          clarifyingAnswers,
          advanceWithAssumptions,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar el brief');
      syncProjectToLocalState(data.project, data.revisions || []);
      await loadInitialData();
      notifyToast(
        advanceWithAssumptions
          ? `Supuestos confirmados (Revisión #${data.project.brief.revision}).`
          : `Brief actualizado a Revisión #${data.project.brief.revision}.`
      );
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMessage(null);
    }
  }

  async function handleStartOrResumeResearch(resumeRunId?: string) {
    if (!currentProject) return;
    setLoadingMessage(
      resumeRunId
        ? 'Reanudando investigación desde el último paso completado...'
        : `Ejecutando investigación (${researchDepth}) en fuentes primarias, GitHub, MCP Registry y X...`
    );
    setErrorBanner(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(currentProject.id)}/research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          depth: researchDepth,
          maxDurationSeconds: researchDurationSeconds,
          maxNetworkRequests: researchMaxRequests,
          reuseCache: true,
          resumeRunId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al ejecutar investigación');
      syncProjectToLocalState(data.project);
      await loadInitialData();
      notifyToast(
        `Investigación finalizada (${data.run.evidenceItems.length} hallazgos verificables, ${data.run.reusedCachedCount} en caché).`
      );
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMessage(null);
    }
  }

  async function handleCancelResearch(runId: string) {
    if (!currentProject) return;
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(currentProject.id)}/research/${encodeURIComponent(runId)}/cancel`,
        { method: 'POST' }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cancelar la investigación');
      syncProjectToLocalState(data.project);
      notifyToast('Investigación cancelada. Podés reanudarla en cualquier momento.');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleRunLiveReaAnalysis() {
    if (!currentProject || !reaTargetInput.trim()) return;
    setLoadingMessage('Ejecutando análisis estático/estructural con REA (Reverse Engineer Anything)...');
    setErrorBanner(null);
    try {
      const res = await fetch('/api/rea/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: currentProject.id,
          targetPath: reaTargetInput.trim(),
          projectNeed: reaNeedInput.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error en análisis REA');
      syncProjectToLocalState(data.project);
      notifyToast(`Ficha REA generada (Evidencia: ${data.card.evidenceId || 'verificada'}).`);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMessage(null);
    }
  }

  async function handleUpdateStack(opts: { preset?: PriorityPresetId; selectedOptionId?: string }) {
    if (!currentProject) return;
    setLoadingMessage('Recalculando matriz de 7 dimensiones, restricciones duras y puntajes compuestos...');
    setErrorBanner(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(currentProject.id)}/stack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al recalcular stack');
      syncProjectToLocalState(data.project);
      await loadInitialData();
      notifyToast('Comparación de stack y artefactos actualizados.');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMessage(null);
    }
  }

  async function handleSaveCapabilitiesSelection() {
    if (!currentProject) return;
    setLoadingMessage('Actualizando selección de capacidades y regenerando planes por cliente...');
    setErrorBanner(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(currentProject.id)}/capabilities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedCatalogIds,
          targetClients: selectedTargetClients,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar capacidades');
      syncProjectToLocalState(data.project);
      notifyToast('Selección de catálogo y planes de entorno actualizados.');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMessage(null);
    }
  }

  async function handleApplyEnvironment(planId?: string) {
    if (!currentProject) return;
    setLoadingMessage(
      'Preparando entorno en el cliente elegido (creando backup SHA-256, configurando skills/MCP y ejecutando sondas)...'
    );
    setErrorBanner(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(currentProject.id)}/environment/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al preparar el entorno');
      syncProjectToLocalState(data.project);
      if (Array.isArray(data.clients)) setClients(data.clients);
      setEnvExecutionNotes([
        `Plan aplicado (${data.appliedPlanId}) · Snapshot SHA-256 creado: ${data.backupId}`,
      ]);
      notifyToast('Preparación y verificación del entorno completadas.');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMessage(null);
    }
  }

  async function handleRevertEnvironment(backupId?: string) {
    if (!currentProject) return;
    setLoadingMessage('Revirtiendo únicamente los cambios realizados por Forja mediante snapshot SHA-256...');
    setErrorBanner(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(currentProject.id)}/environment/revert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al revertir cambios');
      syncProjectToLocalState(data.project);
      if (Array.isArray(data.clients)) setClients(data.clients);
      setEnvExecutionNotes([
        ...(data.revertedFiles || []).map((f: string) => `Restaurado: ${f}`),
        ...(data.skippedConcurrentNotes || []),
      ]);
      notifyToast('Cambios propios revertidos limpiamente.');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMessage(null);
    }
  }

  async function handleAddCustomCatalogEntry(e: React.FormEvent) {
    e.preventDefault();
    setLoadingMessage('Validando seguridad, origen y formato del nuevo ítem de catálogo...');
    setErrorBanner(null);
    try {
      const res = await fetch('/api/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCatName.trim(),
          kind: newCatKind,
          description: newCatDesc.trim(),
          solvesNeed: newCatSolves.trim() || 'Ampliar capacidades del proyecto',
          sourceUrlOrPath: newCatUrl.trim(),
          scopeCategory: newCatKind === 'library_template' ? 'app_runtime_dependency' : 'dev_time_tool',
          license: 'MIT',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo agregar al catálogo');
      setCatalog(data.entries || []);
      setShowNewCatalogForm(false);
      setNewCatName('');
      setNewCatDesc('');
      setNewCatSolves('');
      setNewCatUrl('');
      notifyToast(`Ítem "${data.entry.name}" validado y agregado al catálogo.`);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMessage(null);
    }
  }

  async function handleExportLocal(overwriteManualEdits: boolean) {
    if (!currentProject) return;
    setLoadingMessage('Sincronizando paquete documental y configuración con la carpeta de destino...');
    setErrorBanner(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(currentProject.id)}/export/local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetDirectory: exportDirectoryInput.trim(),
          overwriteManualEdits,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al exportar archivos');
      syncProjectToLocalState(data.project);
      setLocalExportStatus({
        writtenFiles: data.writtenFiles || [],
        preservedManualFiles: data.preservedManualFiles || [],
      });
      if (data.preservedManualFiles && data.preservedManualFiles.length > 0 && !overwriteManualEdits) {
        notifyToast(
          `Se detectaron ${data.preservedManualFiles.length} archivo(s) editados manualmente en disco. Revisá las diferencias antes de sobrescribir.`
        );
      } else {
        notifyToast(`Se escribieron ${data.writtenFiles.length} artefactos en ${exportDirectoryInput}.`);
      }
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMessage(null);
    }
  }

  async function handleExportGitHubBranch() {
    if (!currentProject) return;
    setLoadingMessage('Verificando ausencia de secretos, preparando rama Git y registrando commit...');
    setErrorBanner(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(currentProject.id)}/export/github`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetDirectory: exportDirectoryInput.trim(),
          branchName: gitBranchInput.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al preparar rama Git');
      syncProjectToLocalState(data.project);
      setGitSyncStatus(data.syncResult);
      if (data.syncResult.status !== 'conflict_detected' && data.syncResult.status !== 'blocked_no_credentials') {
        notifyToast(
          `Rama "${data.syncResult.branchName}" lista (Commit ${data.syncResult.newCommitSha}).`
        );
      } else {
        setErrorBanner(data.syncResult.message);
      }
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMessage(null);
    }
  }

  async function handleProbeTypeSafe() {
    setLoadingMessage('Probando conexión en vivo con TypeSafe API (/v1/models y /v1/systemone)...');
    setErrorBanner(null);
    setProbeResponseDetail(null);
    try {
      const overrideKey = secretInputs['TYPESAFE_API_KEY']?.trim() || undefined;
      const res = await fetch('/api/connections/probe-typesafe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: overrideKey }),
      });
      const data = await res.json();
      if (Array.isArray(data.connections)) {
        setConnections(data.connections);
      }
      if (!res.ok || !data.ok) {
        throw new Error(data.probeEvaluation?.errorMessage || 'Fallo al verificar conexión con TypeSafe');
      }
      setProbeResponseDetail(
        `Modelos verificados: ${data.models.map((m: { name: string }) => m.name).join(', ')} · Modelo usado: ${
          data.probeEvaluation.modelUsed
        } · Latencia: ${data.probeEvaluation.latencyMs}ms`
      );
      await loadInitialData();
      notifyToast('Conexión con Jev de TypeSafe verificada correctamente.');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMessage(null);
    }
  }

  async function handleSaveSecret(keyName: string) {
    const val = secretInputs[keyName];
    setLoadingMessage(`Guardando ${keyName} en almacén local no versionado (.data/secrets.json)...`);
    setErrorBanner(null);
    try {
      const res = await fetch('/api/connections/secret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: keyName,
          value: val && val.trim() ? val.trim() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar la clave');
      setConnections(data.connections || []);
      setSecretInputs((prev) => ({ ...prev, [keyName]: '' }));
      notifyToast(`Configuración de ${keyName} actualizada.`);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMessage(null);
    }
  }

  async function handleDeleteProject(projectId: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' });
      if (res.ok) {
        if (currentProject?.id === projectId) {
          setCurrentProject(null);
          setMainView('intake');
        }
        await loadInitialData();
        notifyToast('Proyecto eliminado.');
      }
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    }
  }

  function applyQuickTemplate(kind: 'minimal' | 'detailed' | 'existing') {
    setFolderInspectionPreview(null);
    if (kind === 'minimal') {
      setIntakeMode('new_project');
      setIntakeText(
        'Quiero una aplicación rápida para organizar mis notas técnicas, fragmentos de código y decisiones de arquitectura con búsqueda instantánea.'
      );
      setIntakeLocalPath('');
      setIntakeUrls('');
    } else if (kind === 'detailed') {
      setIntakeMode('new_project');
      setIntakeText(
        'Necesito una aplicación personal en Windows para diseñar prompts, ejecutar pruebas comparativas, registrar costos y exportar reportes en Markdown. Restricciones obligatorias: presupuesto $0/mes en infraestructura, almacenamiento 100% local en SQLite, privacidad estricta sin telemetría a terceros y soporte para agentes locales como Codex.'
      );
      setIntakeLocalPath('');
      setIntakeUrls('https://docs.typesafe.ai\nhttps://agentskills.io/specification');
    } else {
      setIntakeMode('existing_feature');
      setIntakeText(
        'Agregar un módulo de historial de sesiones y exportación JSON compatible con la arquitectura modular actual de AI Studio Pro, sin migrar a otro framework ni romper el flujo existente.'
      );
      setIntakeLocalPath('c:\\Users\\User\\Desktop\\spum\\AI Studio Pro');
      setIntakeUrls('');
    }
  }

  const latestResearchRun =
    currentProject && currentProject.researchRuns.length > 0 ? currentProject.researchRuns[0] : null;
  const selectedStackOption = currentProject?.stackComparison?.options.find(
    (o) => o.id === currentProject.stackComparison?.selectedOptionId
  );
  const overlapWarnings =
    currentProject?.capabilitySelections
      .filter((s) => s.selectedForInstall && s.overlapWarning)
      .map((s) => s.overlapWarning!) || [];

  return (
    <div className="app-shell">
      {/* BARRA LATERAL */}
      <aside className="sidebar">
        <div className="brand-header">
          <div className="brand-badge">FORJA v1.0</div>
          <h1 className="brand-title">Optimizador de Proyectos</h1>
          <p className="brand-subtitle">
            De idea o proyecto existente a definición clara, stack justificado y entorno verificado.
          </p>
        </div>

        <div className="sidebar-actions">
          <button
            type="button"
            className={`nav-btn primary-nav ${mainView === 'intake' ? 'active' : ''}`}
            onClick={() => setMainView('intake')}
          >
            + ¿Qué querés construir o mejorar?
          </button>
          <button
            type="button"
            className={`nav-btn ${mainView === 'connections' ? 'active' : ''}`}
            onClick={() => setMainView('connections')}
          >
            Conexiones, Jev & REA
            <span className="status-dot-group">
              {connections.some((c) => c.provider === 'typesafe' && c.configured) && (
                <span className="dot dot-ok" title="TypeSafe Jev configurado" />
              )}
              {connections.some((c) => c.provider === 'rea_local' && c.configured) && (
                <span className="dot dot-info" title="REA disponible" />
              )}
            </span>
          </button>
        </div>

        <div className="sidebar-section-label">PROYECTOS GUARDADOS ({projects.length})</div>
        <div className="project-list">
          {projects.length === 0 ? (
            <div className="empty-sidebar-note">
              Todavía no hay proyectos guardados. Creá el primero desde el panel central.
            </div>
          ) : (
            projects.map((p) => (
              <div
                key={p.id}
                className={`project-card-item ${
                  currentProject?.id === p.id && mainView === 'project' ? 'selected' : ''
                }`}
                onClick={() => selectProject(p.id)}
              >
                <div className="project-card-top">
                  <span className="project-card-name">{p.name}</span>
                  <button
                    type="button"
                    className="delete-icon-btn"
                    title="Eliminar proyecto"
                    onClick={(e) => handleDeleteProject(p.id, e)}
                  >
                    ×
                  </button>
                </div>
                <div className="project-card-meta">
                  <span className={`mini-badge ${p.mode === 'existing_feature' ? 'mode-existing' : 'mode-new'}`}>
                    {p.mode === 'existing_feature' ? 'Mejora en existente' : 'Proyecto nuevo'}
                  </span>
                  <span className="mini-badge">Rev #{p.brief.revision}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="sidebar-footer">
          <div>Persistencia SQLite activa</div>
          <div className="muted-tiny">Separación estricta: app futura vs optimizador</div>
        </div>
      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <main className="main-area">
        {loadingMessage && (
          <div className="status-banner loading-banner" role="status">
            <span className="spinner" />
            <span>{loadingMessage}</span>
          </div>
        )}
        {errorBanner && (
          <div className="status-banner error-banner" role="alert">
            <div>
              <strong>Atención:</strong> {errorBanner}
            </div>
            <button type="button" className="btn-small" onClick={() => setErrorBanner(null)}>
              Cerrar
            </button>
          </div>
        )}
        {toastMessage && (
          <div className="status-banner toast-banner" role="status">
            <span>{toastMessage}</span>
          </div>
        )}

        {/* VISTA 1: ENTRADA PRINCIPAL ("¿Qué querés construir o mejorar?") */}
        {mainView === 'intake' && (
          <div className="content-container">
            <header className="hero-intake-header">
              <h2>¿Qué querés construir o mejorar?</h2>
              <p>
                Escribí una sola frase, pegá una especificación detallada con restricciones o indicá una carpeta de
                proyecto existente. Forja desarrollará lo que falta, hará como máximo 2 preguntas clave, investigará
                con evidencia verificable, comparará stacks y dejará tu entorno preparado.
              </p>
              <div className="quick-templates-bar">
                <span>Cargar ejemplo rápido:</span>
                <button type="button" className="btn-chip" onClick={() => applyQuickTemplate('minimal')}>
                  1. Idea mínima (1 frase)
                </button>
                <button type="button" className="btn-chip" onClick={() => applyQuickTemplate('detailed')}>
                  2. Especificación con restricciones duras
                </button>
                <button type="button" className="btn-chip" onClick={() => applyQuickTemplate('existing')}>
                  3. Mejorar proyecto existente (AI Studio Pro)
                </button>
              </div>
            </header>

            <form className="intake-form card" onSubmit={handleCreateProject}>
              <div className="mode-toggle-row">
                <button
                  type="button"
                  className={`mode-card-btn ${intakeMode === 'new_project' ? 'active' : ''}`}
                  onClick={() => setIntakeMode('new_project')}
                >
                  <strong>Modo 1: Proyecto nuevo</strong>
                  <span>Diseñar arquitectura, stack, catálogo y documentación desde cero.</span>
                </button>
                <button
                  type="button"
                  className={`mode-card-btn ${intakeMode === 'existing_feature' ? 'active' : ''}`}
                  onClick={() => setIntakeMode('existing_feature')}
                >
                  <strong>Modo 2: Agregar o mejorar una función</strong>
                  <span>
                    Inspecciona un proyecto existente, respeta su stack y convenciones, y propone el cambio mínimo
                    compatible.
                  </span>
                </button>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label htmlFor="intake-local-path">
                    Carpeta o repositorio local{' '}
                    {intakeMode === 'existing_feature' ? '(Requerido para inspeccionar)' : '(Opcional)'}
                  </label>
                  <div className="input-with-btn">
                    <input
                      id="intake-local-path"
                      type="text"
                      placeholder="Ej: c:\Users\User\Desktop\spum\AI Studio Pro"
                      value={intakeLocalPath}
                      onChange={(e) => setIntakeLocalPath(e.target.value)}
                    />
                    <button type="button" className="btn-secondary" onClick={handleInspectFolderPreview}>
                      Inspeccionar carpeta
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="intake-dest">Destino principal del proyecto preparado</label>
                  <select
                    id="intake-dest"
                    value={intakeDestination}
                    onChange={(e) => setIntakeDestination(e.target.value as DestinationType)}
                  >
                    <option value="local">Carpeta local en este equipo</option>
                    <option value="github">Repositorio Git / Rama GitHub</option>
                    <option value="both">Ambos (Carpeta local + Rama GitHub)</option>
                  </select>
                </div>
              </div>

              {folderInspectionPreview && (
                <div className="inspection-preview-box">
                  <div className="inspection-preview-header">
                    <strong>
                      Inspección de proyecto existente:{' '}
                      {folderInspectionPreview.exists ? 'Detectado en disco' : 'Ruta no encontrada'}
                    </strong>
                    <span className="badge badge-info">
                      Pruebas: {folderInspectionPreview.testFrameworks.join(', ') || 'No detectadas'}
                    </span>
                  </div>
                  {folderInspectionPreview.exists && (
                    <>
                      <p className="compact-p">
                        <strong>Stack detectado:</strong> {folderInspectionPreview.detectedStack.join(', ')}
                      </p>
                      <p className="compact-p">
                        <strong>Propuesta de cambio mínimo compatible:</strong>{' '}
                        {folderInspectionPreview.minimalChangeProposal.summary}
                      </p>
                    </>
                  )}
                </div>
              )}

              <div className="form-group">
                <label htmlFor="intake-text">¿Qué querés construir o mejorar? *</label>
                <textarea
                  id="intake-text"
                  rows={5}
                  placeholder="Describí tu idea en una frase o pegá una especificación detallada con restricciones de costo, sistema operativo o privacidad..."
                  value={intakeText}
                  onChange={(e) => setIntakeText(e.target.value)}
                  required
                />
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label htmlFor="intake-urls">URLs de referencia o documentación (una por línea)</label>
                  <textarea
                    id="intake-urls"
                    rows={2}
                    placeholder="https://docs.typesafe.ai&#10;https://github.com/..."
                    value={intakeUrls}
                    onChange={(e) => setIntakeUrls(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="intake-gh">Repositorio GitHub objetivo (opcional)</label>
                  <input
                    id="intake-gh"
                    type="text"
                    placeholder="https://github.com/usuario/repositorio"
                    value={intakeGithubTarget}
                    onChange={(e) => setIntakeGithubTarget(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-submit-row">
                <button type="submit" className="btn-primary btn-large">
                  Generar Propuesta, Evaluar con Jev y Preparar Proyecto →
                </button>
              </div>
            </form>
          </div>
        )}

        {/* VISTA 2: WORKSPACE DEL PROYECTO ACTIVO */}
        {mainView === 'project' && currentProject && (
          <div className="content-container">
            {/* BANNER EJECUTIVO DE ESTADO (4 PUNTOS CLAVE) */}
            <section className="executive-banner card">
              <div className="exec-header-row">
                <div>
                  <span className="badge badge-info">
                    {currentProject.mode === 'existing_feature'
                      ? 'Modo: Agregar/Mejorar función en proyecto existente'
                      : 'Modo: Proyecto nuevo'}
                  </span>
                  <span className="badge badge-neutral">Revisión #{currentProject.brief.revision}</span>
                  <h2 className="exec-project-title">{currentProject.name}</h2>
                </div>
                <div className="exec-header-actions">
                  <a
                    className="btn-secondary btn-small"
                    href={`/api/projects/${encodeURIComponent(currentProject.id)}/export/bundle`}
                    download
                  >
                    Descargar Paquete Portable (.json)
                  </a>
                </div>
              </div>

              <div className="exec-grid-4">
                <div className="exec-box">
                  <div className="exec-label">1. QUÉ ENTENDIÓ LA APP</div>
                  <div className="exec-value">{currentProject.brief.objective}</div>
                  <div className="exec-sub">
                    {currentProject.brief.explicitFacts.length} datos explícitos ·{' '}
                    {currentProject.brief.inferredAssumptions.length} supuestos visibles
                  </div>
                </div>

                <div className="exec-box">
                  <div className="exec-label">2. QUÉ RECOMIENDA Y POR QUÉ</div>
                  <div className="exec-value">
                    {selectedStackOption ? selectedStackOption.name : 'Stack en evaluación'}
                  </div>
                  <div className="exec-sub">
                    Prioridad:{' '}
                    {currentProject.stackComparison
                      ? PRESET_LABELS[currentProject.stackComparison.activePreset].label
                      : 'Equilibrado'}{' '}
                    · {selectedCatalogIds.length} capacidades seleccionadas
                  </div>
                </div>

                <div className="exec-box">
                  <div className="exec-label">3. QUÉ ESTÁ LISTO Y QUÉ FALTA</div>
                  <div className="exec-value">
                    {currentProject.brief.clarifyingQuestions.filter((q) => q.status === 'open').length === 0 ||
                    currentProject.brief.advancedWithAssumptions
                      ? 'Alcance confirmado'
                      : `${
                          currentProject.brief.clarifyingQuestions.filter((q) => q.status === 'open').length
                        } pregunta(s) sugeridas`}
                  </div>
                  <div className="exec-sub">
                    Investigación:{' '}
                    {latestResearchRun ? `${latestResearchRun.evidenceItems.length} fuentes` : 'Pendiente'} · Fichas
                    REA: {currentProject.reaCards.length}
                  </div>
                </div>

                <div className="exec-box exec-box-cta">
                  <div className="exec-label">4. SIGUIENTE ACCIÓN ÚTIL</div>
                  {!currentProject.brief.advancedWithAssumptions &&
                  currentProject.brief.clarifyingQuestions.some((q) => q.status === 'open') ? (
                    <button
                      type="button"
                      className="btn-primary btn-small"
                      onClick={() => handleUpdateBrief(true)}
                    >
                      Avanzar con estos supuestos →
                    </button>
                  ) : !latestResearchRun ? (
                    <button
                      type="button"
                      className="btn-primary btn-small"
                      onClick={() => {
                        setActiveTab('research');
                        void handleStartOrResumeResearch();
                      }}
                    >
                      Ejecutar investigación profunda →
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-primary btn-small"
                      onClick={() => setActiveTab('environment')}
                    >
                      Preparar y verificar entorno →
                    </button>
                  )}
                </div>
              </div>

              {currentProject.staleSectionsRequiringRevalidation.length > 0 && (
                <div className="revalidation-alert">
                  <div>
                    <strong>Aviso de sincronización tras cambio de decisiones:</strong> Se actualizaron los documentos
                    derivados a la Revisión #{currentProject.brief.revision}. Secciones marcadas para revalidación:{' '}
                    <code>{currentProject.staleSectionsRequiringRevalidation.join(' · ')}</code>
                  </div>
                  <button
                    type="button"
                    className="btn-small btn-secondary"
                    onClick={() => setActiveTab('environment')}
                  >
                    Revalidar entorno
                  </button>
                </div>
              )}
            </section>

            {/* NAVEGACIÓN DE PESTAÑAS DEL PROYECTO */}
            <nav className="tabs-bar" aria-label="Secciones del proyecto">
              <button
                type="button"
                className={`tab-btn ${activeTab === 'brief' ? 'active' : ''}`}
                onClick={() => setActiveTab('brief')}
              >
                1. Brief e Interpretación
              </button>
              <button
                type="button"
                className={`tab-btn ${activeTab === 'research' ? 'active' : ''}`}
                onClick={() => setActiveTab('research')}
              >
                2. Investigación y REA (
                {(latestResearchRun?.evidenceItems.length || 0) + currentProject.reaCards.length})
              </button>
              <button
                type="button"
                className={`tab-btn ${activeTab === 'stack' ? 'active' : ''}`}
                onClick={() => setActiveTab('stack')}
              >
                3. Comparación de Stack
              </button>
              <button
                type="button"
                className={`tab-btn ${activeTab === 'environment' ? 'active' : ''}`}
                onClick={() => setActiveTab('environment')}
              >
                4. Catálogo y Entorno ({selectedCatalogIds.length})
              </button>
              <button
                type="button"
                className={`tab-btn ${activeTab === 'docs' ? 'active' : ''}`}
                onClick={() => setActiveTab('docs')}
              >
                5. Documentación, Roles, UX y Entrega
              </button>
            </nav>

            {/* PESTAÑA 1: BRIEF EDITABLE, SUPUESTOS Y PREGUNTAS */}
            {activeTab === 'brief' && (
              <div className="tab-panel">
                {currentProject.existingInspection && (
                  <div className="card highlight-card">
                    <div className="card-header-flex">
                      <h3>Inspección del Proyecto Existente (Cambio Mínimo Compatible)</h3>
                      <span className="badge badge-info">{currentProject.existingInspection.rootPath}</span>
                    </div>
                    <p>{currentProject.existingInspection.architectureSummary}</p>
                    <div className="meta-pills-row">
                      <span>
                        <strong>Stack detectado (preservado):</strong>{' '}
                        {currentProject.existingInspection.detectedStack.join(', ')}
                      </span>
                      <span>
                        <strong>Pruebas:</strong>{' '}
                        {currentProject.existingInspection.testFrameworks.join(', ') || 'Estándar'}
                      </span>
                    </div>
                    <div className="callout-box">
                      <strong>Propuesta de cambio mínimo compatible (sin cambiar el stack):</strong>{' '}
                      {currentProject.existingInspection.minimalChangeProposal.summary}
                    </div>
                  </div>
                )}

                {/* Separación Explícito vs Inferido vs Restricciones */}
                <div className="three-col-grid">
                  <div className="card">
                    <h4>Lo que dijiste explícitamente</h4>
                    <ul className="clean-list">
                      {currentProject.brief.explicitFacts.map((fact, idx) => (
                        <li key={idx}>{fact}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="card">
                    <h4>Lo que inferimos (Supuestos visibles)</h4>
                    <ul className="clean-list">
                      {currentProject.brief.inferredAssumptions.map((assump) => (
                        <li key={assump.id}>
                          <strong>[{assump.category}]</strong> {assump.statement}{' '}
                          <span className="muted-tiny">({assump.rationale})</span>
                        </li>
                      ))}
                    </ul>
                    <div className="card-footnote">
                      Estado:{' '}
                      {currentProject.brief.advancedWithAssumptions
                        ? '✓ Supuestos aceptados para avanzar'
                        : 'Podés avanzar con estos supuestos o ajustarlos abajo'}
                    </div>
                  </div>

                  <div className="card">
                    <h4>Restricciones Comprobables y Vacíos</h4>
                    <div className="constraints-summary">
                      <div className="constraint-chip">
                        <strong>SO:</strong> {currentProject.brief.constraints.targetOs}
                      </div>
                      <div className="constraint-chip">
                        <strong>Presupuesto:</strong> {currentProject.brief.constraints.budgetLimit}
                      </div>
                      <div className="constraint-chip">
                        <strong>Ejecución:</strong> {currentProject.brief.constraints.executionMode}
                      </div>
                      <div className="constraint-chip">
                        <strong>Privacidad:</strong> {currentProject.brief.constraints.privacyLevel}
                      </div>
                      {currentProject.brief.contradictionsDetected.length > 0 && (
                        <div className="contradiction-note">
                          <strong>Contradicciones o vacíos detectados:</strong>{' '}
                          {currentProject.brief.contradictionsDetected.join(' · ')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Preguntas útiles (máximo 2 por interacción) */}
                <div className="card">
                  <div className="card-header-flex">
                    <div>
                      <h3>Preguntas de alto impacto (máximo 2 por interacción)</h3>
                      <p className="muted-sub">
                        Solo preguntamos lo que cambia alcance, arquitectura, costo o experiencia. Cada pregunta incluye
                        una opción recomendada para no bloquearte.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => handleUpdateBrief(true)}
                    >
                      Avanzar con estos supuestos →
                    </button>
                  </div>

                  <div className="questions-grid">
                    {currentProject.brief.clarifyingQuestions.slice(0, 2).map((q, idx) => (
                      <div key={q.id} className="question-box">
                        <div className="question-header">
                          <span className="badge badge-info">Área: {q.area}</span>
                          <span className="badge badge-neutral">Estado: {q.status}</span>
                          <strong>
                            Pregunta {idx + 1}: {q.question}
                          </strong>
                        </div>
                        <p className="muted-tiny">{q.whyItMatters}</p>
                        <div className="options-list">
                          {q.options.map((opt) => {
                            const selected = questionOptionSelections[q.id] === opt.id;
                            return (
                              <label key={opt.id} className={`option-radio-card ${selected ? 'selected' : ''}`}>
                                <input
                                  type="radio"
                                  name={`question-${q.id}`}
                                  checked={selected}
                                  onChange={() =>
                                    setQuestionOptionSelections((prev) => ({
                                      ...prev,
                                      [q.id]: opt.id,
                                    }))
                                  }
                                />
                                <div>
                                  <strong>
                                    {opt.recommended ? '(Recomendado) ' : ''}
                                    {opt.label}
                                  </strong>
                                  <div className="muted-tiny">{opt.impactOnProject}</div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Formulario de Interpretación Editable */}
                <div className="card">
                  <div className="card-header-flex">
                    <h3>Interpretación Editable y Alcance (MVP vs Mejoras Futuras)</h3>
                  </div>

                  <div className="form-grid-2">
                    <div className="form-group">
                      <label htmlFor="edit-title">Título del proyecto</label>
                      <input
                        id="edit-title"
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="edit-users">Usuarios destinatarios</label>
                      <input
                        id="edit-users"
                        type="text"
                        value={editUsers}
                        onChange={(e) => setEditUsers(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="form-grid-2">
                    <div className="form-group">
                      <label htmlFor="edit-objective">Objetivo del proyecto</label>
                      <textarea
                        id="edit-objective"
                        rows={2}
                        value={editObjective}
                        onChange={(e) => setEditObjective(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="edit-problem">Problema central a resolver</label>
                      <textarea
                        id="edit-problem"
                        rows={2}
                        value={editProblem}
                        onChange={(e) => setEditProblem(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="form-grid-2">
                    <div className="form-group">
                      <label htmlFor="edit-mvp">Alcance inicial realizable — MVP (uno por línea)</label>
                      <textarea
                        id="edit-mvp"
                        rows={4}
                        value={editMvpFeatures}
                        onChange={(e) => setEditMvpFeatures(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="edit-future">Mejoras posteriores separadas (una por línea)</label>
                      <textarea
                        id="edit-future"
                        rows={4}
                        value={editFutureFeatures}
                        onChange={(e) => setEditFutureFeatures(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="form-submit-row">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => handleUpdateBrief(false)}
                    >
                      Guardar Interpretación y Recalcular Artefactos (Nueva Revisión)
                    </button>
                  </div>
                </div>

                {revisions.length > 0 && (
                  <div className="card">
                    <h4>Historial de Revisiones del Brief ({revisions.length})</h4>
                    <div className="revision-timeline">
                      {revisions.map((r) => (
                        <div key={r.revision} className="revision-item">
                          <span className="badge badge-neutral">Rev #{r.revision}</span>
                          <strong>{r.objective}</strong>
                          <span className="muted-tiny">{new Date(r.updatedAt).toLocaleString('es-AR')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* PESTAÑA 2: INVESTIGACIÓN PROFUNDA Y FICHAS REA */}
            {activeTab === 'research' && (
              <div className="tab-panel">
                <div className="card">
                  <div className="card-header-flex">
                    <div>
                      <h3>Motor de Investigación Profunda con Resultados Comprobables</h3>
                      <p className="muted-sub">
                        Consulta documentación oficial, repositorios de GitHub (con commit, licencia y mantenimiento),
                        MCP Registry y comunidad X. Reutiliza caché SQLite vigente y permite cancelar o reanudar.
                      </p>
                    </div>
                  </div>

                  <div className="research-controls-row">
                    <div className="form-group">
                      <label htmlFor="res-depth">Profundidad</label>
                      <select
                        id="res-depth"
                        value={researchDepth}
                        onChange={(e) => setResearchDepth(e.target.value as ResearchDepth)}
                      >
                        <option value="fast">Rápida (Fuentes primarias y repos clave)</option>
                        <option value="normal">Normal (Recorrido completo + MCP + X)</option>
                        <option value="deep">Profunda (Cobertura extendida de repos y riesgos)</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="res-time">Presupuesto de tiempo (segundos)</label>
                      <input
                        id="res-time"
                        type="number"
                        min={5}
                        max={300}
                        value={researchDurationSeconds}
                        onChange={(e) => setResearchDurationSeconds(Number(e.target.value))}
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="res-reqs">Presupuesto máx. consultas red</label>
                      <input
                        id="res-reqs"
                        type="number"
                        min={2}
                        max={50}
                        value={researchMaxRequests}
                        onChange={(e) => setResearchMaxRequests(Number(e.target.value))}
                      />
                    </div>

                    <div className="research-cta-group">
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => handleStartOrResumeResearch()}
                      >
                        Ejecutar Investigación Ahora
                      </button>
                      {latestResearchRun &&
                        (latestResearchRun.status === 'cancelled' || latestResearchRun.status === 'paused') && (
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => handleStartOrResumeResearch(latestResearchRun.id)}
                          >
                            Reanudar Ejecución ({latestResearchRun.id})
                          </button>
                        )}
                      {latestResearchRun && latestResearchRun.status === 'running' && (
                        <button
                          type="button"
                          className="btn-danger"
                          onClick={() => handleCancelResearch(latestResearchRun.id)}
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>

                  {latestResearchRun && (
                    <div className="research-run-status-box">
                      <div className="run-summary-bar">
                        <span>
                          <strong>Estado:</strong> {latestResearchRun.status.toUpperCase()}
                        </span>
                        <span>
                          <strong>Propósito:</strong> {latestResearchRun.purpose}
                        </span>
                        <span>
                          <strong>Consumo:</strong> {latestResearchRun.elapsedMs}ms · {latestResearchRun.requestsUsed}/
                          {latestResearchRun.budget.maxNetworkRequests} reqs ({latestResearchRun.reusedCachedCount}{' '}
                          reutilizadas de caché SQLite)
                        </span>
                      </div>

                      <div className="steps-progress-grid">
                        {latestResearchRun.steps.map((step) => (
                          <div key={step.stepIndex} className={`step-pill step-${step.status}`}>
                            <strong>{step.name}</strong>
                            <span>
                              {step.status === 'completed' ? `✓ (${step.itemsFound} hallazgos)` : step.status}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="x-coverage-banner">
                        <strong>Cobertura de X (Twitter) [{latestResearchRun.xCoverageStatus}]:</strong>{' '}
                        {latestResearchRun.xCoverageNote}
                      </div>
                    </div>
                  )}
                </div>

                {/* Listado de Evidencia Verificable */}
                {latestResearchRun && latestResearchRun.evidenceItems.length > 0 && (
                  <div className="card">
                    <div className="card-header-flex">
                      <h3>Hallazgos y Fuentes Comprobables ({latestResearchRun.evidenceItems.length})</h3>
                      <div className="filter-pills">
                        {[
                          ['all', 'Todas'],
                          ['open_source_repo', 'Repositorios GitHub'],
                          ['tech_option', 'Opciones Tecnológicas'],
                          ['mcp_skill_tool', 'MCP y Skills'],
                          ['comparable_app', 'Apps Comparables'],
                          ['community_x', 'Comunidad X'],
                          ['technical_risk', 'Riesgos Técnicos'],
                        ].map(([val, label]) => (
                          <button
                            key={val}
                            type="button"
                            className={`btn-chip ${evidenceFilter === val ? 'active' : ''}`}
                            onClick={() => setEvidenceFilter(val)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="evidence-list">
                      {latestResearchRun.evidenceItems
                        .filter((ev) => evidenceFilter === 'all' || ev.category === evidenceFilter)
                        .map((ev) => (
                          <article key={ev.id} className="evidence-card">
                            <div className="evidence-top">
                              <div>
                                <span className="badge badge-info">{ev.sourceType}</span>
                                <span className="badge badge-neutral">{ev.category}</span>
                                <h4>
                                  <a href={ev.url} target="_blank" rel="noreferrer">
                                    {ev.title} ↗
                                  </a>
                                </h4>
                              </div>
                              <div className="muted-tiny">
                                Consultado: {new Date(ev.consultedAt).toLocaleString('es-AR')}
                              </div>
                            </div>

                            <p>{ev.summary}</p>
                            <div className="evidence-relation">
                              <strong>Relación con necesidad del proyecto:</strong> {ev.projectNeedRelation}
                            </div>

                            {ev.repoMetadata && (
                              <div className="repo-metadata-box">
                                <div>
                                  <strong>Repo:</strong> {ev.repoMetadata.fullName} ·{' '}
                                  <strong>Commit/Versión:</strong> <code>{ev.repoMetadata.versionOrCommit}</code> ·{' '}
                                  <strong>Licencia:</strong> {ev.repoMetadata.license} ·{' '}
                                  <strong>Mantenimiento:</strong> {ev.repoMetadata.maintenanceStatus} (Último push:{' '}
                                  {ev.repoMetadata.lastPushedAt.slice(0, 10)})
                                </div>
                                <div className="muted-tiny">
                                  <strong>Requisitos:</strong> {ev.repoMetadata.requirements.join(', ')} ·{' '}
                                  <strong>Límites conocidos:</strong> {ev.repoMetadata.knownLimits.join('; ')}
                                </div>
                                <div className="muted-tiny">
                                  <em>Nota metodológica:</em> {ev.repoMetadata.starsNote}
                                </div>
                              </div>
                            )}

                            {ev.contradictionsOrUncertainties && (
                              <div className="contradiction-note">
                                <strong>Incertidumbres / Límites a considerar:</strong>{' '}
                                {ev.contradictionsOrUncertainties}
                              </div>
                            )}
                          </article>
                        ))}
                    </div>
                  </div>
                )}

                {/* SECCIÓN REA: FICHAS POR REFERENCIA */}
                <div className="card">
                  <div className="card-header-flex">
                    <div>
                      <h3>REA (Reverse Engineer Anything) — Aprender de Aplicaciones y Funciones Existentes</h3>
                      <p className="muted-sub">
                        Cada ficha separa estrictamente <strong>Observación</strong> (AST/artefacto real),{' '}
                        <strong>Inferencia</strong> (patrón deducido) y <strong>Reproducción comprobada</strong>, sin
                        cargar motores nativos pesados cuando basta inspección JS/web.
                      </p>
                    </div>
                  </div>

                  <div className="rea-analyzer-bar">
                    <input
                      type="text"
                      placeholder="Ruta local a analizar con REA (ej. c:\Users\User\Desktop\spum\AI Studio Pro)"
                      value={reaTargetInput}
                      onChange={(e) => setReaTargetInput(e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="¿Qué necesidad del proyecto ayuda a resolver esta referencia?"
                      value={reaNeedInput}
                      onChange={(e) => setReaNeedInput(e.target.value)}
                    />
                    <button type="button" className="btn-secondary" onClick={handleRunLiveReaAnalysis}>
                      Analizar con REA en Vivo
                    </button>
                  </div>

                  <div className="rea-cards-grid">
                    {currentProject.reaCards.map((card) => (
                      <article key={card.id} className="rea-card">
                        <div className="rea-card-header">
                          <div>
                            <span className="badge badge-info">Decisión: {card.decision.toUpperCase()}</span>
                            <span className="badge badge-neutral">Herramienta: {card.toolUsed}</span>
                            <h4>{card.targetName}</h4>
                          </div>
                          <div className="rea-hashes muted-tiny">
                            {card.evidenceId && (
                              <div>
                                Evidencia REA: <code>{card.evidenceId.slice(0, 22)}...</code>
                              </div>
                            )}
                            {card.artifactSha256 && (
                              <div>
                                SHA-256: <code>{card.artifactSha256.slice(0, 16)}...</code>
                              </div>
                            )}
                          </div>
                        </div>

                        <p>
                          <strong>Necesidad del proyecto que resuelve:</strong> {card.projectNeed}
                        </p>
                        <p>
                          <strong>Función observada:</strong> {card.observedFeature}
                        </p>

                        <div className="rea-three-layers">
                          <div className="rea-layer layer-obs">
                            <h5>1. Observaciones (Evidencia directa)</h5>
                            <ul>
                              {card.epistemic.observations.map((o, i) => (
                                <li key={i}>{o}</li>
                              ))}
                            </ul>
                          </div>
                          <div className="rea-layer layer-inf">
                            <h5>2. Inferencias (Arquitectura deducida)</h5>
                            <ul>
                              {card.epistemic.inferences.map((inf, i) => (
                                <li key={i}>{inf}</li>
                              ))}
                            </ul>
                          </div>
                          <div className="rea-layer layer-rep">
                            <h5>3. Reproducciones comprobadas</h5>
                            <ul>
                              {card.epistemic.verifiedReproductions.map((rep, i) => (
                                <li key={i}>{rep}</li>
                              ))}
                            </ul>
                          </div>
                        </div>

                        <div className="rea-footer-details">
                          <div>
                            <strong>Patrón o estructura reutilizable:</strong> {card.reusablePatternOrCode}
                          </div>
                          <div>
                            <strong>Adaptaciones para tu proyecto:</strong> {card.requiredAdaptations.join(' · ')}
                          </div>
                          <div>
                            <strong>Límites del análisis:</strong> {card.analysisLimits.join(' · ')}
                          </div>
                          <div className="muted-tiny">
                            <strong>Licencia ({card.licenseAndAttribution.sourceLicense}):</strong>{' '}
                            {card.licenseAndAttribution.reaLicenseDisclaimer}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* PESTAÑA 3: COMPARACIÓN DE TECNOLOGÍAS Y ELECCIÓN DEL STACK */}
            {activeTab === 'stack' && currentProject.stackComparison && (
              <div className="tab-panel">
                <div className="card">
                  <h3>Prioridades de Evaluación (Recálculo en Tiempo Real)</h3>
                  <p className="muted-sub">
                    Primero se aplican las <strong>restricciones duras comprobables</strong> (sistema operativo,
                    presupuesto, privacidad). Una opción incompatible queda descalificada y no puede ganar aunque tenga
                    buena puntuación general. Entre las opciones válidas, cambiá la prioridad para recalcular la
                    propuesta.
                  </p>

                  <div className="preset-buttons-grid">
                    {(Object.keys(PRESET_LABELS) as PriorityPresetId[]).map((presetKey) => {
                      const active = currentProject.stackComparison?.activePreset === presetKey;
                      return (
                        <button
                          key={presetKey}
                          type="button"
                          className={`preset-card-btn ${active ? 'active' : ''}`}
                          onClick={() => handleUpdateStack({ preset: presetKey })}
                        >
                          <strong>{PRESET_LABELS[presetKey].label}</strong>
                          <span>{PRESET_LABELS[presetKey].desc}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="recommendation-callout">
                    <div>
                      <span className="badge badge-success">Recomendación Principal</span>
                      <h4>{selectedStackOption?.name}</h4>
                      <p>{currentProject.stackComparison.recommendationRationale}</p>
                      <p className="when-to-prefer-other">
                        <strong>¿Qué prioridad haría preferible otra alternativa?</strong>{' '}
                        {currentProject.stackComparison.prioritySensitivityExplanation}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Tarjetas de Alternativas y Compuerta de Restricciones Duras */}
                <div className="stack-options-grid">
                  {currentProject.stackComparison.options.map((opt) => {
                    const isSelected = opt.id === currentProject.stackComparison?.selectedOptionId;
                    return (
                      <div
                        key={opt.id}
                        className={`card stack-option-card ${isSelected ? 'recommended-border' : ''} ${
                          opt.disqualifiedByHardConstraint ? 'disqualified-card' : ''
                        }`}
                      >
                        <div className="stack-opt-header">
                          <div>
                            {isSelected && <span className="badge badge-success">★ Seleccionado / Recomendado</span>}
                            {opt.disqualifiedByHardConstraint ? (
                              <span className="badge badge-danger">DESCALIFICADO POR RESTRICCIÓN DURA</span>
                            ) : (
                              <span className="badge badge-info">Cumple restricciones duras</span>
                            )}
                            <h4>{opt.name}</h4>
                          </div>
                          <div className="composite-score-circle">
                            <span>{opt.weightedScore}</span>
                            <small>/100</small>
                          </div>
                        </div>

                        <p className="muted-sub">{opt.tagline}</p>

                        <div className="stack-components-list">
                          <span className="tech-pill">
                            <strong>Frontend:</strong> {opt.components.frontend}
                          </span>
                          <span className="tech-pill">
                            <strong>Backend:</strong> {opt.components.backend}
                          </span>
                          <span className="tech-pill">
                            <strong>Storage:</strong> {opt.components.storage}
                          </span>
                          <span className="tech-pill">
                            <strong>Runtime:</strong> {opt.components.runtime}
                          </span>
                        </div>

                        {opt.disqualifiedByHardConstraint && opt.disqualificationReason && (
                          <div className="disqualification-box">
                            <strong>Motivo de descalificación automática:</strong> {opt.disqualificationReason}
                          </div>
                        )}

                        <div className="cost-estimate-box">
                          <strong>Costo estimado:</strong> {opt.costEstimate.monthlyRangeUsd}
                          <div className="muted-tiny">
                            Supuestos: {opt.costEstimate.assumptions.join('; ')} · Fuente: {opt.costEstimate.sourceUrl}
                          </div>
                          <div className="muted-tiny">{opt.costEstimate.note}</div>
                        </div>

                        <div className="when-choose-box">
                          <strong>Cuándo preferir esta opción:</strong> {opt.whenToPreferThis}
                        </div>

                        {!opt.disqualifiedByHardConstraint && !isSelected && (
                          <button
                            type="button"
                            className="btn-secondary btn-small"
                            onClick={() => handleUpdateStack({ selectedOptionId: opt.id })}
                          >
                            Seleccionar este stack para el proyecto
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Matriz Comparativa de las 7 Dimensiones Obligatorias */}
                <div className="card">
                  <h3>Matriz Comparativa en las 7 Dimensiones Obligatorias</h3>
                  <div className="table-responsive">
                    <table className="comparison-table">
                      <thead>
                        <tr>
                          <th>Dimensión</th>
                          <th>Peso actual</th>
                          {currentProject.stackComparison.options.map((opt) => (
                            <th key={opt.id}>
                              {opt.name}{' '}
                              {opt.disqualifiedByHardConstraint && (
                                <span className="badge badge-danger">Descalificado</span>
                              )}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(Object.keys(DIMENSION_LABELS) as StackDimensionKey[]).map((dimKey) => {
                          const weight = currentProject.stackComparison!.weights[dimKey];
                          return (
                            <tr key={dimKey}>
                              <td>
                                <strong>{DIMENSION_LABELS[dimKey]}</strong>
                              </td>
                              <td>{Math.round(weight)}%</td>
                              {currentProject.stackComparison!.options.map((opt) => {
                                const cell = opt.dimensions[dimKey];
                                return (
                                  <td key={opt.id}>
                                    <div className="dim-score-badge">
                                      {Math.round(cell.scoreNormalized * 100)}/100 (Nivel {cell.rawScoreLevel}/3)
                                    </div>
                                    <div className="dim-explanation">{cell.explanation}</div>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Documentación Separada: Stack del propio Optimizador vs Proyecto del Usuario */}
                {ownStackDecision && (
                  <div className="card own-stack-disclosure">
                    <div className="card-header-flex">
                      <h4>Decisión de Arquitectura Separada: {ownStackDecision.title}</h4>
                      <span className="badge badge-neutral">Separación de dependencias</span>
                    </div>
                    <p>{ownStackDecision.rationale}</p>
                    <p>
                      <strong>Principio de aislamiento:</strong> {ownStackDecision.separationPrinciple}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* PESTAÑA 4: CATÁLOGO DE CAPACIDADES Y ADAPTADORES POR CLIENTE */}
            {activeTab === 'environment' && (
              <div className="tab-panel">
                {overlapWarnings.length > 0 && (
                  <div className="status-banner warning-banner">
                    <div>
                      <strong>Solapamiento detectado entre herramientas seleccionadas:</strong>
                      <ul className="compact-list">
                        {overlapWarnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* Panel de Adaptadores por Cliente y Ejecución Real */}
                <div className="card">
                  <div className="card-header-flex">
                    <div>
                      <h3>Preparación y Verificación del Entorno por Cliente</h3>
                      <p className="muted-sub">
                        Distingue los 5 estados de alistamiento: <strong>1. Recomendado</strong> →{' '}
                        <strong>2. Seleccionado</strong> → <strong>3. Instalado/Configurado</strong> →{' '}
                        <strong>4. Reconocido por el cliente</strong> → <strong>5. Probado y Verificado</strong>. Creá
                        copias de respaldo SHA-256 antes de tocar archivos y revertí tus cambios con un clic.
                      </p>
                    </div>
                    <div className="button-row">
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => handleApplyEnvironment()}
                      >
                        Preparar y Verificar Entorno Elegido
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => handleRevertEnvironment()}
                      >
                        Revertir Cambios Propios
                      </button>
                    </div>
                  </div>

                  {envExecutionNotes.length > 0 && (
                    <div className="execution-log-box">
                      <strong>Registro de última operación sobre el entorno:</strong>
                      <ul>
                        {envExecutionNotes.map((note, idx) => (
                          <li key={idx}>
                            <code>{note}</code>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {currentProject.environmentPlans.map((plan) => (
                    <div key={plan.id} className="env-plan-card">
                      <div className="env-plan-header">
                        <div>
                          <span className="badge badge-info">
                            Clientes: {plan.targetClients.join(', ').toUpperCase()}
                          </span>
                          {plan.backupManifestId && (
                            <span className="badge badge-success">Snapshot SHA-256: {plan.backupManifestId}</span>
                          )}
                          <h4>Plan de Preparación ({plan.actions.length} acciones planificadas)</h4>
                        </div>
                        <button
                          type="button"
                          className="btn-secondary btn-small"
                          onClick={() => handleApplyEnvironment(plan.id)}
                        >
                          Ejecutar Plan
                        </button>
                      </div>

                      <div className="table-responsive">
                        <table className="comparison-table">
                          <thead>
                            <tr>
                              <th>Cliente</th>
                              <th>Capacidad</th>
                              <th>Operación</th>
                              <th>Ruta de Destino</th>
                              <th>Estado de Alistamiento (5 Etapas)</th>
                              <th>Evidencia de Verificación</th>
                            </tr>
                          </thead>
                          <tbody>
                            {plan.actions.map((act) => {
                              const st = READINESS_LABELS[act.stage] || READINESS_LABELS.selected;
                              return (
                                <tr key={act.id}>
                                  <td>
                                    <strong>{act.clientId}</strong>
                                  </td>
                                  <td>
                                    <strong>{act.capabilityName}</strong>
                                  </td>
                                  <td>
                                    <span className="badge badge-neutral">{act.kind}</span>
                                  </td>
                                  <td>
                                    <code>{act.targetPath}</code>
                                  </td>
                                  <td>
                                    <span className={`badge ${st.badgeClass}`}>{st.label}</span>
                                  </td>
                                  <td className="muted-tiny">
                                    <div>{act.operationSummary}</div>
                                    {act.verificationDetail && (
                                      <div>
                                        <strong>Verificación:</strong> {act.verificationDetail}
                                      </div>
                                    )}
                                    {act.pendingInstruction && (
                                      <div>
                                        <strong>Pendiente:</strong> {act.pendingInstruction}
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Catálogo Consultable y Ampliable */}
                <div className="card">
                  <div className="card-header-flex">
                    <div>
                      <h3>Catálogo Consultable y Ampliable de Capacidades ({catalog.length} ítems)</h3>
                      <p className="muted-sub">
                        Separa herramientas de preparación de agentes (Skills, MCP, CLI) de las librerías que formarán
                        parte del runtime del proyecto futuro.
                      </p>
                    </div>
                    <div className="button-row">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setShowNewCatalogForm((v) => !v)}
                      >
                        {showNewCatalogForm ? 'Cerrar formulario' : '+ Ampliar Catálogo'}
                      </button>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={handleSaveCapabilitiesSelection}
                      >
                        Guardar Selección ({selectedCatalogIds.length})
                      </button>
                    </div>
                  </div>

                  {showNewCatalogForm && (
                    <form className="new-catalog-form" onSubmit={handleAddCustomCatalogEntry}>
                      <h4>Incorporar nueva capacidad validada al catálogo</h4>
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>Nombre *</label>
                          <input
                            type="text"
                            required
                            placeholder="Ej: MCP Postgres Inspector"
                            value={newCatName}
                            onChange={(e) => setNewCatName(e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label>Categoría *</label>
                          <select
                            value={newCatKind}
                            onChange={(e) => setNewCatKind(e.target.value as CapabilityKind)}
                          >
                            <option value="skill">Skill (Instrucciones SKILL.md)</option>
                            <option value="mcp">Servidor MCP (Model Context Protocol)</option>
                            <option value="cli_tool">Herramienta / CLI</option>
                            <option value="library_template">Librería / Plantilla (Runtime de la futura app)</option>
                            <option value="design_reference">Referencia de Diseño / UX / UI</option>
                          </select>
                        </div>
                      </div>
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>URL o ruta de origen verificable *</label>
                          <input
                            type="text"
                            required
                            placeholder="https://github.com/..."
                            value={newCatUrl}
                            onChange={(e) => setNewCatUrl(e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label>Qué necesidad resuelve *</label>
                          <input
                            type="text"
                            required
                            placeholder="Inspección de esquemas y consultas seguras"
                            value={newCatSolves}
                            onChange={(e) => setNewCatSolves(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="form-group">
                        <label>Descripción detallada *</label>
                        <textarea
                          rows={2}
                          required
                          placeholder="Explicá qué resuelve, cuándo conviene y sus límites..."
                          value={newCatDesc}
                          onChange={(e) => setNewCatDesc(e.target.value)}
                        />
                      </div>
                      <button type="submit" className="btn-primary btn-small">
                        Validar y Guardar en Catálogo
                      </button>
                    </form>
                  )}

                  <div className="catalog-filters-bar">
                    <div className="filter-pills">
                      {(
                        [
                          ['all', 'Todos'],
                          ['skill', 'Skills'],
                          ['mcp', 'Servidores MCP'],
                          ['cli_tool', 'Herramientas y CLI'],
                          ['library_template', 'Librerías y Plantillas'],
                          ['design_reference', 'Referencias Diseño/UX'],
                        ] as Array<[CapabilityKind | 'all', string]>
                      ).map(([catKey, label]) => (
                        <button
                          key={catKey}
                          type="button"
                          className={`btn-chip ${catalogKindFilter === catKey ? 'active' : ''}`}
                          onClick={() => setCatalogKindFilter(catKey)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <input
                      type="search"
                      className="catalog-search-input"
                      placeholder="Buscar por nombre, tecnología o capacidad..."
                      value={catalogSearch}
                      onChange={(e) => setCatalogSearch(e.target.value)}
                    />
                  </div>

                  <div className="catalog-grid">
                    {catalog
                      .filter(
                        (item) =>
                          (catalogKindFilter === 'all' || item.kind === catalogKindFilter) &&
                          (!catalogSearch.trim() ||
                            item.name.toLowerCase().includes(catalogSearch.toLowerCase()) ||
                            item.description.toLowerCase().includes(catalogSearch.toLowerCase()))
                      )
                      .map((item) => {
                        const checked = selectedCatalogIds.includes(item.id);
                        const projSel = currentProject.capabilitySelections.find((s) => s.catalogId === item.id);
                        return (
                          <div key={item.id} className={`catalog-card ${checked ? 'selected' : ''}`}>
                            <div className="catalog-card-top">
                              <label className="catalog-checkbox-label">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => {
                                    setSelectedCatalogIds((prev) =>
                                      prev.includes(item.id)
                                        ? prev.filter((id) => id !== item.id)
                                        : [...prev, item.id]
                                    );
                                  }}
                                />
                                <strong>{item.name}</strong>
                              </label>
                              <span
                                className={`badge ${
                                  item.scopeCategory === 'app_runtime_dependency' ? 'badge-warning' : 'badge-info'
                                }`}
                              >
                                {item.scopeCategory === 'app_runtime_dependency'
                                  ? 'Dependencia Proyecto Futuro'
                                  : `Herramienta Agente (${item.kind})`}
                              </span>
                            </div>

                            <p className="compact-p">{item.description}</p>
                            <div className="muted-tiny">
                              <strong>Resuelve:</strong> {item.solvesNeed}
                            </div>
                            {projSel && (
                              <div className="muted-tiny">
                                <strong>Clasificación en este proyecto:</strong> [{projSel.classification}] —{' '}
                                {projSel.classificationReason}
                              </div>
                            )}
                            <div className="catalog-card-footer">
                              <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="muted-tiny">
                                Origen verificable ({item.license}) ↗
                              </a>
                              {item.overlapGroup && (
                                <span className="muted-tiny">Grupo: {item.overlapGroup}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            )}

            {/* PESTAÑA 5: DOCUMENTACIÓN, ROLES DE AGENTES, UX Y DESTINOS */}
            {activeTab === 'docs' && (
              <div className="tab-panel">
                {/* Propuesta UX/UI y Boceto Visual */}
                {currentProject.uxProposal && (
                  <div className="card">
                    <h3>Propuesta de Experiencia (UX), Interfaz y Boceto Visual de Pantallas</h3>
                    <p>
                      <strong>Arquitectura de navegación:</strong> {currentProject.uxProposal.navigationArchitecture}
                    </p>

                    <div className="wireframe-grid">
                      {currentProject.uxProposal.keyScreens.map((scr) => (
                        <div key={scr.id} className="wireframe-screen-card">
                          <div className="wireframe-browser-bar">
                            <span className="dot dot-danger" />
                            <span className="dot dot-warning" />
                            <span className="dot dot-ok" />
                            <strong>{scr.name}</strong>
                          </div>
                          <p className="muted-tiny">{scr.purpose}</p>
                          <div className="wireframe-zones">
                            {scr.primaryActions.map((act, ci) => (
                              <div key={ci} className="wireframe-zone-box">
                                {act}
                              </div>
                            ))}
                          </div>
                          <div className="wireframe-states">
                            <span className="badge badge-neutral" title={scr.states.empty}>
                              Estado Vacío ✓
                            </span>
                            <span className="badge badge-neutral" title={scr.states.loading}>
                              Cargando ✓
                            </span>
                            <span className="badge badge-neutral" title={scr.states.errorAndRecovery}>
                              Error y Recuperación ✓
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Roles de Agentes y Tareas Asignadas (Sin conflictos de archivos) */}
                <div className="card">
                  <h3>Organización de Agentes, Roles y Tareas Asignadas</h3>
                  <p className="muted-sub">
                    Los roles se adaptan a la complejidad del proyecto. Cada tarea define alcance exclusivo de archivos (
                    <code>ownedFilesScope</code>) para evitar colisiones y un prompt listo para transferir a Codex o tu
                    cliente elegido.
                  </p>

                  <div className="roles-pills-row">
                    {currentProject.agentRoles.map((role) => (
                      <div key={role.id} className="role-badge-card">
                        <div className="card-header-flex">
                          <strong>{role.title}</strong>
                          <button
                            type="button"
                            className="btn-secondary btn-small"
                            onClick={() => {
                              void navigator.clipboard.writeText(role.readyPromptForAgent);
                              notifyToast(`Prompt del rol "${role.title}" copiado al portapapeles.`);
                            }}
                          >
                            Copiar Prompt del Rol
                          </button>
                        </div>
                        <span className="muted-tiny">{role.objective}</span>
                        <code>Entregable: {role.deliverable}</code>
                      </div>
                    ))}
                  </div>

                  <div className="tasks-list">
                    {currentProject.tasks.map((task) => {
                      const roleObj = currentProject.agentRoles.find((r) => r.id === task.roleId);
                      return (
                        <div key={task.id} className="task-item-card">
                          <div className="task-top-row">
                            <div>
                              <span className="badge badge-info">{roleObj?.title || task.roleId}</span>
                              <span className="badge badge-neutral">Prioridad: {task.priority}</span>
                              <h4>{task.title}</h4>
                            </div>
                          </div>
                          <p className="compact-p">{task.description}</p>
                          <div className="muted-tiny">
                            <strong>Frontera de archivos (sin solapamiento):</strong>{' '}
                            <code>{task.ownedFilesScope.join(', ')}</code> · <strong>Criterios de aceptación:</strong>{' '}
                            {task.acceptanceCriteria.join(' | ')}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Visor de Paquete Documental Generado */}
                <div className="card">
                  <div className="card-header-flex">
                    <h3>Paquete Documental Proporcional (Sincronizado con Rev #{currentProject.brief.revision})</h3>
                    <span className="badge badge-success">
                      {currentProject.generatedArtifacts.length} artefactos listos
                    </span>
                  </div>

                  <div className="docs-viewer-layout">
                    <div className="docs-sidebar-list">
                      {currentProject.generatedArtifacts.map((art, idx) => (
                        <button
                          key={art.relativePath}
                          type="button"
                          className={`doc-file-btn ${selectedArtifactIndex === idx ? 'active' : ''}`}
                          onClick={() => setSelectedArtifactIndex(idx)}
                        >
                          <strong>{art.relativePath}</strong>
                          <span className="muted-tiny">Rev #{art.sourceBriefRevision}</span>
                        </button>
                      ))}
                    </div>

                    <div className="doc-content-pane">
                      {currentProject.generatedArtifacts[selectedArtifactIndex] && (
                        <>
                          <div className="doc-pane-header">
                            <strong>{currentProject.generatedArtifacts[selectedArtifactIndex].title}</strong>
                            <span className="muted-tiny">
                              SHA-256:{' '}
                              <code>
                                {currentProject.generatedArtifacts[selectedArtifactIndex].sha256.slice(0, 16)}
                              </code>
                            </span>
                          </div>
                          <pre className="doc-pre-code">
                            {currentProject.generatedArtifacts[selectedArtifactIndex].content}
                          </pre>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Destinos de Entrega: Carpeta Local y Rama GitHub */}
                <div className="card">
                  <h3>Destinos de Entrega y Sincronización Segura</h3>
                  <p className="muted-sub">
                    Exportá el paquete documental a una carpeta local (detectando ediciones manuales antes de
                    sobrescribir) o prepará una rama Git verificando que jamás se incluyan credenciales ni secretos.
                  </p>

                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>Carpeta local de destino</label>
                      <div className="input-with-btn">
                        <input
                          type="text"
                          value={exportDirectoryInput}
                          onChange={(e) => setExportDirectoryInput(e.target.value)}
                        />
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => handleExportLocal(false)}
                        >
                          Escribir en Carpeta Local
                        </button>
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Rama Git / GitHub para commit de preparación</label>
                      <div className="input-with-btn">
                        <input
                          type="text"
                          value={gitBranchInput}
                          onChange={(e) => setGitBranchInput(e.target.value)}
                        />
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={handleExportGitHubBranch}
                        >
                          Preparar Rama Git Segura
                        </button>
                      </div>
                    </div>
                  </div>

                  {localExportStatus && (
                    <div className="export-result-box">
                      <div>
                        <strong>Archivos sincronizados ({localExportStatus.writtenFiles.length}):</strong>{' '}
                        <code>{localExportStatus.writtenFiles.join(', ') || 'Ninguno'}</code>
                      </div>
                      {localExportStatus.preservedManualFiles.length > 0 && (
                        <div className="manual-conflict-warning">
                          <strong>
                            ¡Atención! Se detectaron ediciones manuales en disco que no fueron sobrescritas:
                          </strong>
                          {localExportStatus.preservedManualFiles.map((c) => (
                            <div key={c.relativePath} className="conflict-diff-item">
                              <div>
                                Archivo modificado manualmente: <code>{c.relativePath}</code>
                              </div>
                              <pre className="diff-pre">{c.diff}</pre>
                            </div>
                          ))}
                          <button
                            type="button"
                            className="btn-danger btn-small"
                            onClick={() => handleExportLocal(true)}
                          >
                            Sobrescribir ediciones manuales con la Revisión #{currentProject.brief.revision}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {gitSyncStatus && (
                    <div className="export-result-box">
                      <div>
                        <strong>Estado Rama Git ({gitSyncStatus.branchName}):</strong> {gitSyncStatus.message} ·{' '}
                        <strong>Escaneo anti-secretos:</strong>{' '}
                        {gitSyncStatus.secretsScanPassed ? '✓ Aprobado (0 secretos)' : '✗ Bloqueado'}
                      </div>
                      <div className="muted-tiny">{gitSyncStatus.executionPendingNote}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* VISTA 3: CONEXIONES, SECRETOS, JEV Y REA */}
        {mainView === 'connections' && (
          <div className="content-container">
            <header className="hero-intake-header">
              <h2>Conexiones, Jev de TypeSafe y Diagnóstico REA</h2>
              <p>
                Las claves se almacenan localmente fuera del control de versiones (<code>.data/secrets.json</code> o
                variables de entorno del usuario en Windows) y jamás se exponen en artefactos ni commits.
              </p>
            </header>

            <div className="connections-grid">
              {connections.map((conn) => (
                <div key={conn.provider} className="card connection-card">
                  <div className="card-header-flex">
                    <h4>{conn.displayName}</h4>
                    <span className={`badge ${conn.configured ? 'badge-success' : 'badge-warning'}`}>
                      {conn.configured ? `Configurado (${conn.sourceScope})` : 'No configurado'}
                    </span>
                  </div>
                  <p className="compact-p">{conn.statusMessage}</p>
                  {conn.maskedHint && (
                    <div className="muted-tiny">
                      Credencial activa (enmascarada): <code>{conn.maskedHint}</code>
                    </div>
                  )}

                  {conn.provider === 'typesafe' && (
                    <div className="connection-actions-box">
                      <div className="input-with-btn">
                        <input
                          type="password"
                          placeholder="Nueva TYPESAFE_API_KEY (opcional para cambiarla)"
                          value={secretInputs['TYPESAFE_API_KEY'] || ''}
                          onChange={(e) =>
                            setSecretInputs((prev) => ({ ...prev, TYPESAFE_API_KEY: e.target.value }))
                          }
                        />
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => handleSaveSecret('TYPESAFE_API_KEY')}
                        >
                          Guardar Clave
                        </button>
                        <button type="button" className="btn-primary" onClick={handleProbeTypeSafe}>
                          Probar conexión (/v1/models + /v1/systemone)
                        </button>
                      </div>
                      {probeResponseDetail && <div className="probe-success-note">✓ {probeResponseDetail}</div>}
                    </div>
                  )}

                  {conn.provider === 'generative_llm' && (
                    <div className="connection-actions-box">
                      <div className="input-with-btn">
                        <input
                          type="password"
                          placeholder="OPENAI_API_KEY (separada de Jev)"
                          value={secretInputs['OPENAI_API_KEY'] || ''}
                          onChange={(e) =>
                            setSecretInputs((prev) => ({ ...prev, OPENAI_API_KEY: e.target.value }))
                          }
                        />
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => handleSaveSecret('OPENAI_API_KEY')}
                        >
                          Guardar
                        </button>
                      </div>
                    </div>
                  )}

                  {conn.provider === 'github' && (
                    <div className="connection-actions-box">
                      <div className="input-with-btn">
                        <input
                          type="password"
                          placeholder="GITHUB_TOKEN (opcional para mayor cuota API)"
                          value={secretInputs['GITHUB_TOKEN'] || ''}
                          onChange={(e) =>
                            setSecretInputs((prev) => ({ ...prev, GITHUB_TOKEN: e.target.value }))
                          }
                        />
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => handleSaveSecret('GITHUB_TOKEN')}
                        >
                          Guardar
                        </button>
                      </div>
                    </div>
                  )}

                  {conn.provider === 'x_api' && (
                    <div className="connection-actions-box">
                      <div className="input-with-btn">
                        <input
                          type="password"
                          placeholder="X_BEARER_TOKEN (API v2 de X)"
                          value={secretInputs['X_BEARER_TOKEN'] || ''}
                          onChange={(e) =>
                            setSecretInputs((prev) => ({ ...prev, X_BEARER_TOKEN: e.target.value }))
                          }
                        />
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => handleSaveSecret('X_BEARER_TOKEN')}
                        >
                          Guardar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Estado de Clientes Detectados en la PC */}
            <div className="card">
              <h3>Clientes y Entornos de Agentes Detectados en este Equipo</h3>
              <div className="table-responsive">
                <table className="comparison-table">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Entorno</th>
                      <th>Estado en Disco</th>
                      <th>Ruta de Configuración</th>
                      <th>Directorio de Skills</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((cl) => (
                      <tr key={cl.clientId}>
                        <td>
                          <strong>{cl.displayName}</strong>
                        </td>
                        <td>
                          <span className="badge badge-info">{cl.executionEnvironment}</span>
                        </td>
                        <td>{cl.detectedOnPc ? '✓ Detectado' : 'Se creará al preparar'}</td>
                        <td>
                          <code>{cl.configFilePath}</code>
                        </td>
                        <td>
                          <code>{cl.skillsDirectoryPath || 'Exportación manual'}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Registro de Evaluaciones Jev */}
            <div className="card">
              <h3>Historial Auditado de Evaluaciones en Jev de TypeSafe ({jevEvaluations.length})</h3>
              <p className="muted-sub">
                Registra criterios, versión de evaluación, modelo utilizado (<code>jev-latest</code>), latencia y
                resultado estructurado, sin guardar jamás credenciales.
              </p>
              <div className="table-responsive">
                <table className="comparison-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Caso de Uso</th>
                      <th>Versión Evaluación</th>
                      <th>Modelo</th>
                      <th>Estado</th>
                      <th>Respuestas Tipadas / Latencia</th>
                      <th>Uso Tokens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jevEvaluations.slice(0, 15).map((ev) => (
                      <tr key={ev.id}>
                        <td className="muted-tiny">{new Date(ev.createdAt).toLocaleTimeString('es-AR')}</td>
                        <td>
                          <code>{ev.useCase}</code>
                        </td>
                        <td>
                          <code>{ev.evaluationVersion}</code>
                        </td>
                        <td>{ev.modelUsed}</td>
                        <td>
                          <span className={`badge ${ev.status === 'success' ? 'badge-success' : 'badge-danger'}`}>
                            {ev.status}
                          </span>
                        </td>
                        <td className="muted-tiny">
                          {ev.status === 'success'
                            ? `${Object.keys(ev.answers).length} respuestas (${ev.latencyMs}ms)`
                            : ev.errorMessage}
                        </td>
                        <td className="muted-tiny">
                          in: {ev.usage.inputTokens} / out: {ev.usage.outputTokens}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
