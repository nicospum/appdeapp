import React, { useEffect, useRef, useState } from 'react';
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
  UploadedVisualReference,
} from '../shared/types.js';

type ActiveMainView = 'intake' | 'project' | 'connections';
type WizardStep = 'questions' | 'ready_prompt';
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

const LOCAL_STORAGE_PROJECTS_KEY = 'forja_cached_projects_v1';

function readCachedProjectsFromBrowser(): ProjectRecord[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_PROJECTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ProjectRecord[]) : [];
  } catch {
    return [];
  }
}

function saveCachedProjectInBrowser(project: ProjectRecord): ProjectRecord[] {
  try {
    const current = readCachedProjectsFromBrowser();
    const filtered = current.filter((p) => p.id !== project.id);
    const updated = [project, ...filtered].slice(0, 30);
    window.localStorage.setItem(LOCAL_STORAGE_PROJECTS_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [project];
  }
}

function removeCachedProjectFromBrowser(projectId: string): ProjectRecord[] {
  try {
    const current = readCachedProjectsFromBrowser();
    const updated = current.filter((p) => p.id !== projectId);
    window.localStorage.setItem(LOCAL_STORAGE_PROJECTS_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

export function App() {
  const [mainView, setMainView] = useState<ActiveMainView>('intake');
  const [wizardStep, setWizardStep] = useState<WizardStep>('questions');
  const [showAdvancedTabs, setShowAdvancedTabs] = useState<boolean>(false);
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
  const [copiedBanner, setCopiedBanner] = useState<boolean>(false);

  // Estado del Paso 1: Entrada simple + Imágenes de referencia
  const [intakeMode, setIntakeMode] = useState<ProjectMode>('new_project');
  const [intakeText, setIntakeText] = useState<string>('');
  const [intakeImages, setIntakeImages] = useState<UploadedVisualReference[]>([]);
  const [showExtraIntakeOptions, setShowExtraIntakeOptions] = useState<boolean>(false);
  const [intakeLocalPath, setIntakeLocalPath] = useState<string>('');
  const [intakeUrls, setIntakeUrls] = useState<string>('');
  const [intakeDestination, setIntakeDestination] = useState<DestinationType>('local');
  const [intakeGithubTarget, setIntakeGithubTarget] = useState<string>('');
  const [folderInspectionPreview, setFolderInspectionPreview] = useState<ExistingProjectInspection | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const projectFileInputRef = useRef<HTMLInputElement | null>(null);

  // Estado del Paso 2 y Edición de Brief
  const [editTitle, setEditTitle] = useState<string>('');
  const [editObjective, setEditObjective] = useState<string>('');
  const [editProblem, setEditProblem] = useState<string>('');
  const [editUsers, setEditUsers] = useState<string>('');
  const [editMvpFeatures, setEditMvpFeatures] = useState<string>('');
  const [editFutureFeatures, setEditFutureFeatures] = useState<string>('');
  const [questionOptionSelections, setQuestionOptionSelections] = useState<Record<string, string>>({});
  const [questionCustomAnswers, setQuestionCustomAnswers] = useState<Record<string, string>>({});
  const [editableMasterPrompt, setEditableMasterPrompt] = useState<string>('');

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
        const cached = readCachedProjectsFromBrowser();
        const byId = new Map<string, ProjectRecord>();
        for (const p of cached) byId.set(p.id, p);
        for (const p of projRes.projects as ProjectRecord[]) byId.set(p.id, p);
        const merged = Array.from(byId.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        setProjects(merged);
      } else {
        setProjects(readCachedProjectsFromBrowser());
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
    const updatedList = saveCachedProjectInBrowser(project);
    setProjects((prev) => {
      const byId = new Map<string, ProjectRecord>();
      for (const p of prev) byId.set(p.id, p);
      for (const p of updatedList) byId.set(p.id, p);
      byId.set(project.id, project);
      return Array.from(byId.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    });
    setEditTitle(project.brief.title);
    setEditObjective(project.brief.objective);
    setEditProblem(project.brief.problemStatement);
    setEditUsers(project.brief.targetUsers);
    setEditMvpFeatures(project.brief.mvpScope.join('\n'));
    setEditFutureFeatures(project.brief.futureImprovements.join('\n'));

    const initialAnswers: Record<string, string> = {};
    const initialCustom: Record<string, string> = {};
    for (const q of project.brief.clarifyingQuestions) {
      const recOpt = q.options.find((o) => o.recommended) || q.options[0];
      initialAnswers[q.id] = q.selectedOptionId || recOpt?.id || '';
      initialCustom[q.id] = q.customAnswer || '';
    }
    setQuestionOptionSelections(initialAnswers);
    setQuestionCustomAnswers(initialCustom);

    const masterArt = project.generatedArtifacts.find((a) => a.relativePath === 'PROMPT-MAESTRO-AGENTE.md');
    setEditableMasterPrompt(
      project.masterAgentPrompt || masterArt?.content || project.agentRoles[0]?.readyPromptForAgent || ''
    );

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

  // Lectura de archivos de imagen (subidos por botón, drag-and-drop o pegados con Ctrl+V)
  async function filesToVisualReferences(fileList: FileList | File[]): Promise<UploadedVisualReference[]> {
    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    const results: UploadedVisualReference[] = [];

    for (const file of files.slice(0, 6)) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error(`No se pudo leer la imagen ${file.name}`));
        reader.readAsDataURL(file);
      });
      results.push({
        id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        fileName: file.name || `captura-${results.length + 1}.png`,
        mimeType: file.type || 'image/png',
        dataUrl,
        sizeBytes: file.size,
        userNote: '',
      });
    }
    return results;
  }

  async function handleIntakeImageUpload(files: FileList | File[] | null) {
    if (!files || files.length === 0) return;
    try {
      const newRefs = await filesToVisualReferences(files);
      if (newRefs.length === 0) {
        setErrorBanner('Seleccioná archivos de imagen válidos (PNG, JPG, WEBP, GIF).');
        return;
      }
      setIntakeImages((prev) => [...prev, ...newRefs]);
      notifyToast(`${newRefs.length} imagen(es) agregada(s) a tu idea.`);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleProjectImageUpload(files: FileList | File[] | null) {
    if (!files || files.length === 0 || !currentProject) return;
    try {
      const newRefs = await filesToVisualReferences(files);
      if (newRefs.length === 0) return;
      const updatedImages = [...(currentProject.inputImages || []), ...newRefs];
      const res = await fetch(`/api/projects/${encodeURIComponent(currentProject.id)}/brief`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputImages: updatedImages, _clientSnapshot: currentProject }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al adjuntar imágenes');
      syncProjectToLocalState(data.project, data.revisions || []);
      notifyToast('Imagen de referencia incorporada al proyecto y al Prompt Maestro.');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    }
  }

  function handlePasteImagesOnIntake(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const f = items[i].getAsFile();
        if (f) imageFiles.push(f);
      }
    }
    if (imageFiles.length > 0) {
      void handleIntakeImageUpload(imageFiles);
    }
  }

  async function selectProject(projectId: string, preferredStep?: WizardStep) {
    setLoadingMessage('Abriendo tu proyecto...');
    setErrorBanner(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`);
      let p: ProjectRecord | null = null;
      if (res.ok) {
        const data = await res.json();
        p = data.project as ProjectRecord;
        syncProjectToLocalState(p, data.revisions || []);
        if (Array.isArray(data.jevEvaluations)) {
          setJevEvaluations(data.jevEvaluations);
        }
      } else {
        const cached = readCachedProjectsFromBrowser().find((item) => item.id === projectId) ||
          projects.find((item) => item.id === projectId) || null;
        if (!cached) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Error al cargar proyecto');
        }
        p = cached;
        syncProjectToLocalState(p, [p.brief]);
      }
      if (preferredStep) {
        setWizardStep(preferredStep);
      } else {
        const allAnswered =
          p.brief.advancedWithAssumptions || p.brief.clarifyingQuestions.every((q) => q.status !== 'open');
        setWizardStep(allAnswered ? 'ready_prompt' : 'questions');
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
    setLoadingMessage('Inspeccionando carpeta existente...');
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
      notifyToast('Carpeta inspeccionada correctamente.');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMessage(null);
    }
  }

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!intakeText.trim() || intakeText.trim().length < 3) {
      setErrorBanner('Escribí al menos una frase contando qué querés construir.');
      return;
    }
    setLoadingMessage('Analizando tu idea, tus imágenes y preparando las 2 preguntas clave...');
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
          inputImages: intakeImages,
          existingProjectPath: intakeLocalPath.trim() || undefined,
          destinationType: intakeDestination,
          localTargetPath: intakeLocalPath.trim() || undefined,
          githubRepoTarget: intakeGithubTarget.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo crear el proyecto');

      syncProjectToLocalState(data.project, [data.project.brief]);
      setWizardStep('questions');
      setMainView('project');
      notifyToast('¡Listo! Respondé estas 2 preguntas rápidas para generar el Prompt Maestro.');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMessage(null);
    }
  }

  async function handleUpdateBriefAndGoToPrompt(advanceWithAssumptions: boolean) {
    if (!currentProject) return;
    setLoadingMessage('Armando el proyecto completo y generando el Súper Prompt para tu agente programador...');
    setErrorBanner(null);
    try {
      const clarifyingAnswers = Object.entries(questionOptionSelections).map(([questionId, selectedOptionId]) => ({
        questionId,
        selectedOptionId,
        customAnswer: questionCustomAnswers[questionId]?.trim() || undefined,
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
          _clientSnapshot: currentProject,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar el proyecto');
      syncProjectToLocalState(data.project, data.revisions || []);
      await loadInitialData();
      setWizardStep('ready_prompt');
      notifyToast('¡Tu proyecto y el Súper Prompt ya están listos para copiar!');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMessage(null);
    }
  }

  function handleCopyMasterPrompt(textToCopy?: string) {
    const text = textToCopy || editableMasterPrompt;
    void navigator.clipboard.writeText(text);
    setCopiedBanner(true);
    notifyToast('¡Prompt copiado al portapapeles! Ya podés pegarlo en tu agente programador.');
    setTimeout(() => setCopiedBanner(false), 4000);
  }

  async function handleStartOrResumeResearch(resumeRunId?: string) {
    if (!currentProject) return;
    setLoadingMessage(
      resumeRunId
        ? 'Reanudando investigación...'
        : `Investigando referencias, repositorios GitHub y herramientas (${researchDepth})...`
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
          _clientSnapshot: currentProject,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al ejecutar investigación');
      syncProjectToLocalState(data.project);
      await loadInitialData();
      notifyToast(`Investigación completada (${data.run.evidenceItems.length} fuentes comprobables).`);
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
      notifyToast('Investigación pausada/cancelada.');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleRunLiveReaAnalysis() {
    if (!currentProject || !reaTargetInput.trim()) return;
    setLoadingMessage('Analizando proyecto de referencia con REA...');
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
      notifyToast(`Ficha de referencia REA agregada al proyecto.`);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMessage(null);
    }
  }

  async function handleUpdateStack(opts: { preset?: PriorityPresetId; selectedOptionId?: string }) {
    if (!currentProject) return;
    setLoadingMessage('Actualizando el stack tecnológico y regenerando el Prompt Maestro...');
    setErrorBanner(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(currentProject.id)}/stack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...opts, _clientSnapshot: currentProject }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al recalcular stack');
      syncProjectToLocalState(data.project);
      await loadInitialData();
      notifyToast('Stack y Prompt Maestro actualizados.');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMessage(null);
    }
  }

  async function handleSaveCapabilitiesSelection() {
    if (!currentProject) return;
    setLoadingMessage('Actualizando herramientas seleccionadas...');
    setErrorBanner(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(currentProject.id)}/capabilities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedCatalogIds,
          targetClients: selectedTargetClients,
          _clientSnapshot: currentProject,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar capacidades');
      syncProjectToLocalState(data.project);
      notifyToast('Herramientas actualizadas en tu proyecto.');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMessage(null);
    }
  }

  async function handleApplyEnvironment(planId?: string) {
    if (!currentProject) return;
    setLoadingMessage('Configurando skills y MCPs en tu agente local (con copia de seguridad reversible)...');
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
        `Entorno preparado (${data.appliedPlanId}) · Copia de respaldo SHA-256: ${data.backupId}`,
      ]);
      notifyToast('¡Tu agente local ya tiene las skills y herramientas configuradas!');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMessage(null);
    }
  }

  async function handleRevertEnvironment(backupId?: string) {
    if (!currentProject) return;
    setLoadingMessage('Revirtiendo cambios mediante copia de respaldo...');
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
      notifyToast('Cambios revertidos limpiamente.');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMessage(null);
    }
  }

  async function handleAddCustomCatalogEntry(e: React.FormEvent) {
    e.preventDefault();
    setLoadingMessage('Guardando nueva herramienta en el catálogo...');
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
      notifyToast(`"${data.entry.name}" agregada al catálogo.`);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMessage(null);
    }
  }

  async function handleExportLocal(overwriteManualEdits: boolean) {
    if (!currentProject) return;
    setLoadingMessage('Guardando el Prompt Maestro y la documentación en la carpeta...');
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
          `Se detectaron ${data.preservedManualFiles.length} archivo(s) editados manualmente. Revisá antes de sobrescribir.`
        );
      } else {
        notifyToast(`¡Archivos guardados en ${exportDirectoryInput}!`);
      }
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMessage(null);
    }
  }

  async function handleExportGitHubBranch() {
    if (!currentProject) return;
    setLoadingMessage('Preparando rama Git limpia sin secretos...');
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
        notifyToast(`Rama "${data.syncResult.branchName}" creada (Commit ${data.syncResult.newCommitSha}).`);
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
    setLoadingMessage('Probando conexión con Jev de TypeSafe...');
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
        `Modelos activos: ${data.models.map((m: { name: string }) => m.name).join(', ')} · Modelo usado: ${
          data.probeEvaluation.modelUsed
        } (${data.probeEvaluation.latencyMs}ms)`
      );
      await loadInitialData();
      notifyToast('Conexión con Jev verificada.');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMessage(null);
    }
  }

  async function handleSaveSecret(keyName: string) {
    const val = secretInputs[keyName];
    setLoadingMessage(`Guardando ${keyName}...`);
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
      notifyToast(`Clave ${keyName} actualizada.`);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMessage(null);
    }
  }

  async function handleDeleteProject(projectId: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await fetch(`/api/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' }).catch(() => null);
      removeCachedProjectFromBrowser(projectId);
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
      if (currentProject?.id === projectId) {
        setCurrentProject(null);
        setMainView('intake');
      }
      notifyToast('Proyecto eliminado.');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    }
  }

  function applyQuickTemplate(kind: 'minimal' | 'detailed' | 'existing') {
    setFolderInspectionPreview(null);
    if (kind === 'minimal') {
      setIntakeMode('new_project');
      setIntakeText(
        'Quiero una aplicación rápida para organizar mis notas técnicas, fragmentos de código y capturas con búsqueda instantánea.'
      );
      setIntakeLocalPath('');
      setIntakeUrls('');
      setShowExtraIntakeOptions(false);
    } else if (kind === 'detailed') {
      setIntakeMode('new_project');
      setIntakeText(
        'Necesito una aplicación personal en Windows para diseñar prompts, comparar resultados, guardar historial en SQLite local ($0/mes, sin nube) y exportar reportes en Markdown.'
      );
      setIntakeLocalPath('');
      setIntakeUrls('https://docs.typesafe.ai');
      setShowExtraIntakeOptions(false);
    } else {
      setIntakeMode('existing_feature');
      setIntakeText(
        'Agregar un panel de historial de sesiones y exportación JSON a mi proyecto AI Studio Pro sin cambiar su diseño actual.'
      );
      setIntakeLocalPath('c:\\Users\\User\\Desktop\\spum\\AI Studio Pro');
      setIntakeUrls('');
      setShowExtraIntakeOptions(true);
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
      {/* BARRA LATERAL SIMPLE Y LIMPIA */}
      <aside className="sidebar">
        <div className="brand-header">
          <div className="brand-badge">FORJA</div>
          <h1 className="brand-title">Armador de Proyectos</h1>
          <p className="brand-subtitle">
            Escribí tu idea, subí imágenes, respondé 2 preguntas y llevate el Súper Prompt listo para tu agente.
          </p>
        </div>

        <div className="sidebar-actions">
          <button
            type="button"
            className={`nav-btn primary-nav ${mainView === 'intake' ? 'active' : ''}`}
            onClick={() => {
              setMainView('intake');
              setShowAdvancedTabs(false);
            }}
          >
            ✨ Nueva Idea / Proyecto
          </button>
          <button
            type="button"
            className={`nav-btn ${mainView === 'connections' ? 'active' : ''}`}
            onClick={() => setMainView('connections')}
          >
            🔌 Conexiones (Jev & REA)
            <span className="status-dot-group">
              {connections.some((c) => c.provider === 'typesafe' && c.configured) && (
                <span className="dot dot-ok" title="TypeSafe Jev activo" />
              )}
              {connections.some((c) => c.provider === 'rea_local' && c.configured) && (
                <span className="dot dot-info" title="REA activo" />
              )}
            </span>
          </button>
        </div>

        <div className="sidebar-section-label">MIS PROYECTOS ({projects.length})</div>
        <div className="project-list">
          {projects.length === 0 ? (
            <div className="empty-sidebar-note">
              Todavía no creaste ningún proyecto. Escribí tu primera idea en el panel central.
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
                    {p.mode === 'existing_feature' ? 'Mejora' : 'Nuevo'}
                  </span>
                  {p.inputImages && p.inputImages.length > 0 && (
                    <span className="mini-badge">🖼 {p.inputImages.length} img</span>
                  )}
                  <span className="mini-badge">v{p.brief.revision}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ÁREA CENTRAL */}
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

        {/* ====================================================================
            PASO 1: ENTRADA SIMPLE + CARGA DE IMÁGENES DE REFERENCIA
           ==================================================================== */}
        {mainView === 'intake' && (
          <div className="content-container wizard-container">
            <div className="wizard-steps-indicator">
              <div className="step-item active">
                <span className="step-circle">1</span>
                <span>Contanos tu idea y subí imágenes</span>
              </div>
              <div className="step-divider" />
              <div className="step-item">
                <span className="step-circle">2</span>
                <span>Respondé 2 preguntas rápidas</span>
              </div>
              <div className="step-divider" />
              <div className="step-item">
                <span className="step-circle">3</span>
                <span>Copiá el Súper Prompt para tu Agente</span>
              </div>
            </div>

            <form className="intake-form card hero-card" onSubmit={handleCreateProject} onPaste={handlePasteImagesOnIntake}>
              <div className="hero-intake-header">
                <h2>¿Qué aplicación o función querés hacer?</h2>
                <p>
                  Escribí tu idea con tus palabras (puede ser un renglón o un texto largo) y, si querés,{' '}
                  <strong>subí o pegá imágenes</strong> de cómo te gustaría que se vea.
                </p>
              </div>

              <div className="quick-templates-bar">
                <span className="muted-tiny">Probar con un ejemplo:</span>
                <button type="button" className="btn-chip" onClick={() => applyQuickTemplate('minimal')}>
                  💡 Idea corta de 1 frase
                </button>
                <button type="button" className="btn-chip" onClick={() => applyQuickTemplate('detailed')}>
                  📋 Idea detallada ($0 y local)
                </button>
                <button type="button" className="btn-chip" onClick={() => applyQuickTemplate('existing')}>
                  🔧 Mejorar un proyecto que ya tengo
                </button>
              </div>

              <div className="form-group">
                <textarea
                  id="intake-text"
                  className="big-idea-textarea"
                  rows={5}
                  placeholder="Ej: Quiero hacer una aplicación para organizar mis tareas y proyectos, que tenga una columna a la izquierda con mis carpetas, tarjetas visuales en el centro y un botón para resumir todo..."
                  value={intakeText}
                  onChange={(e) => setIntakeText(e.target.value)}
                  required
                />
              </div>

              {/* ZONA DE CARGA DE IMÁGENES (CLICK, DRAG & DROP O CTRL+V) */}
              <div
                className="image-dropzone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void handleIntakeImageUpload(e.dataTransfer.files);
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => void handleIntakeImageUpload(e.target.files)}
                />
                <div className="dropzone-content">
                  <div className="dropzone-icon">🖼️</div>
                  <div>
                    <strong>¿Tenés imágenes, capturas o dibujos de cómo querés que sea?</strong>
                    <div className="muted-tiny">
                      Arrastralas acá, pegalas con <kbd>Ctrl</kbd>+<kbd>V</kbd> o hacé clic en el botón para elegirlas
                      de tu PC.
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    + Cargar Imágenes
                  </button>
                </div>

                {intakeImages.length > 0 && (
                  <div className="uploaded-images-grid">
                    {intakeImages.map((img, idx) => (
                      <div key={img.id} className="uploaded-image-card">
                        <img src={img.dataUrl} alt={img.fileName} className="uploaded-thumb" />
                        <div className="uploaded-image-info">
                          <div className="uploaded-image-top">
                            <strong>
                              Imagen {idx + 1}: {img.fileName}
                            </strong>
                            <button
                              type="button"
                              className="delete-icon-btn"
                              title="Quitar imagen"
                              onClick={() =>
                                setIntakeImages((prev) => prev.filter((item) => item.id !== img.id))
                              }
                            >
                              ×
                            </button>
                          </div>
                          <input
                            type="text"
                            placeholder="¿Qué te gusta de esta imagen? (ej: el menú lateral, los colores, el diseño)"
                            value={img.userNote || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setIntakeImages((prev) =>
                                prev.map((item) => (item.id === img.id ? { ...item, userNote: val } : item))
                              );
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* OPCIONES ADICIONALES PLEGABLES PARA NO ENSUCIAR LA PANTALLA */}
              <div className="extra-options-toggle">
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => setShowExtraIntakeOptions((v) => !v)}
                >
                  {showExtraIntakeOptions
                    ? '▲ Ocultar opciones de carpeta existente o links'
                    : '▼ ¿Querés mejorar un proyecto que ya tenés en una carpeta o pegar links? (Opcional)'}
                </button>
              </div>

              {showExtraIntakeOptions && (
                <div className="extra-options-box">
                  <div className="mode-toggle-row">
                    <button
                      type="button"
                      className={`mode-card-btn ${intakeMode === 'new_project' ? 'active' : ''}`}
                      onClick={() => setIntakeMode('new_project')}
                    >
                      <strong>Proyecto nuevo desde cero</strong>
                      <span>Armar toda la aplicación nueva.</span>
                    </button>
                    <button
                      type="button"
                      className={`mode-card-btn ${intakeMode === 'existing_feature' ? 'active' : ''}`}
                      onClick={() => setIntakeMode('existing_feature')}
                    >
                      <strong>Agregar o mejorar una función en carpeta existente</strong>
                      <span>Analiza tu carpeta actual y respeta lo que ya tenés hecho.</span>
                    </button>
                  </div>

                  <div className="form-grid-2">
                    <div className="form-group">
                      <label htmlFor="intake-local-path">Ruta de tu carpeta local (si ya existe)</label>
                      <div className="input-with-btn">
                        <input
                          id="intake-local-path"
                          type="text"
                          placeholder="Ej: c:\Users\User\Desktop\spum\AI Studio Pro"
                          value={intakeLocalPath}
                          onChange={(e) => setIntakeLocalPath(e.target.value)}
                        />
                        <button type="button" className="btn-secondary" onClick={handleInspectFolderPreview}>
                          Revisar carpeta
                        </button>
                      </div>
                    </div>

                    <div className="form-group">
                      <label htmlFor="intake-urls">Links o páginas de referencia (opcional)</label>
                      <input
                        id="intake-urls"
                        type="text"
                        placeholder="https://..."
                        value={intakeUrls}
                        onChange={(e) => setIntakeUrls(e.target.value)}
                      />
                    </div>
                  </div>

                  {folderInspectionPreview && (
                    <div className="inspection-preview-box">
                      <strong>
                        Carpeta detectada ({folderInspectionPreview.detectedStack.join(', ')}):
                      </strong>{' '}
                      {folderInspectionPreview.minimalChangeProposal.summary}
                    </div>
                  )}
                </div>
              )}

              <div className="form-submit-row">
                <button type="submit" className="btn-primary btn-hero">
                  Continuar → Hacerme un par de preguntas y armar el proyecto
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ====================================================================
            VISTA DE PROYECTO ACTIVO: ASISTENTE SIMPLE (PASO 2 Y PASO 3)
           ==================================================================== */}
        {mainView === 'project' && currentProject && (
          <div className="content-container wizard-container">
            {/* BARRA SUPERIOR SIMPLE DE PASOS */}
            <div className="wizard-steps-indicator">
              <button
                type="button"
                className="step-item clickable-step done"
                onClick={() => setMainView('intake')}
              >
                <span className="step-circle">✓</span>
                <span>1. Idea e Imágenes</span>
              </button>
              <div className="step-divider" />
              <button
                type="button"
                className={`step-item clickable-step ${wizardStep === 'questions' ? 'active' : 'done'}`}
                onClick={() => setWizardStep('questions')}
              >
                <span className="step-circle">2</span>
                <span>2. Un par de preguntas rápidas</span>
              </button>
              <div className="step-divider" />
              <button
                type="button"
                className={`step-item clickable-step ${wizardStep === 'ready_prompt' ? 'active' : ''}`}
                onClick={() => setWizardStep('ready_prompt')}
              >
                <span className="step-circle">3</span>
                <span>3. Súper Prompt Listo para tu Agente</span>
              </button>
            </div>

            {/* ----------------------------------------------------------------
                PASO 2 DEL ASISTENTE: UN PAR DE PREGUNTAS CLARAS Y RÁPIDAS
               ---------------------------------------------------------------- */}
            {wizardStep === 'questions' && (
              <div className="wizard-step-card card hero-card">
                <div className="step-header-block">
                  <span className="badge badge-info">Paso 2 de 3 · Definir un par de detalles</span>
                  <h2>Esto entendimos de tu idea: respondé estas 2 preguntas para terminar de armarlo</h2>
                  <p className="muted-sub">
                    Ya marcamos la opción recomendada en cada pregunta. Si estás de acuerdo, tocá directamente el botón
                    azul de abajo.
                  </p>
                </div>

                {/* Resumen claro y editable de lo entendido */}
                <div className="understood-summary-box">
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>Nombre del proyecto</label>
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label>Tecnología recomendada automáticamente</label>
                      <div className="readonly-pill">
                        <strong>{selectedStackOption?.name || 'Web Local Rápida'}</strong>
                      </div>
                    </div>
                  </div>
                  <div className="form-group" style={{ marginTop: '10px' }}>
                    <label>Qué va a hacer tu aplicación (podés corregirlo si querés)</label>
                    <textarea
                      rows={2}
                      value={editObjective}
                      onChange={(e) => setEditObjective(e.target.value)}
                    />
                  </div>

                  {/* Imágenes adjuntas o botón para sumar otra imagen */}
                  <div className="project-images-strip">
                    <input
                      ref={projectFileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      style={{ display: 'none' }}
                      onChange={(e) => void handleProjectImageUpload(e.target.files)}
                    />
                    <div className="images-strip-header">
                      <strong>
                        🖼️ Imágenes de cómo querés que se vea ({currentProject.inputImages?.length || 0})
                      </strong>
                      <button
                        type="button"
                        className="btn-secondary btn-small"
                        onClick={() => projectFileInputRef.current?.click()}
                      >
                        + Agregar otra imagen
                      </button>
                    </div>
                    {currentProject.inputImages && currentProject.inputImages.length > 0 && (
                      <div className="uploaded-images-grid">
                        {currentProject.inputImages.map((img, i) => (
                          <div key={img.id} className="uploaded-image-card">
                            <img src={img.dataUrl} alt={img.fileName} className="uploaded-thumb" />
                            <div className="uploaded-image-info">
                              <strong>
                                Imagen {i + 1}: {img.fileName}
                              </strong>
                              <span className="muted-tiny">
                                {img.userNote || 'Incluida como guía de diseño en el Súper Prompt'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* LAS 2 PREGUNTAS CLAVE */}
                <div className="simple-questions-section">
                  <h3>Respondé estas {currentProject.brief.clarifyingQuestions.slice(0, 2).length} preguntas rápidas:</h3>
                  <div className="questions-grid">
                    {currentProject.brief.clarifyingQuestions.slice(0, 2).map((q, idx) => (
                      <div key={q.id} className="question-box big-question-box">
                        <div className="question-header">
                          <span className="question-number-badge">Pregunta {idx + 1}</span>
                          <h4>{q.question}</h4>
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
                                    {opt.recommended ? '⭐ (Recomendado) ' : ''}
                                    {opt.label.replace(/^\(Recomendado\)\s*/i, '')}
                                  </strong>
                                  <div className="muted-tiny">{opt.impactOnProject}</div>
                                </div>
                              </label>
                            );
                          })}
                        </div>

                        <div className="custom-answer-row">
                          <input
                            type="text"
                            placeholder="O escribí tu propia respuesta acá si preferís otra cosa..."
                            value={questionCustomAnswers[q.id] || ''}
                            onChange={(e) =>
                              setQuestionCustomAnswers((prev) => ({
                                ...prev,
                                [q.id]: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="wizard-cta-footer">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleUpdateBriefAndGoToPrompt(true)}
                  >
                    Usar todo lo recomendado y avanzar
                  </button>
                  <button
                    type="button"
                    className="btn-primary btn-hero"
                    onClick={() => handleUpdateBriefAndGoToPrompt(false)}
                  >
                    ✨ Generar mi Proyecto y el Súper Prompt para el Agente →
                  </button>
                </div>
              </div>
            )}

            {/* ----------------------------------------------------------------
                PASO 3 DEL ASISTENTE: EL SÚPER PROMPT LISTO PARA EL AGENTE
               ---------------------------------------------------------------- */}
            {wizardStep === 'ready_prompt' && (
              <div className="wizard-step-card card hero-card">
                <div className="ready-prompt-top-bar">
                  <div>
                    <span className="badge badge-success">✓ Proyecto Armado y Listo</span>
                    <h2>Tu Súper Prompt está listo para mandarlo a tu Agente Programador</h2>
                    <p className="muted-sub">
                      Copiá este prompt completo y pegalo en tu agente (<strong>Codex</strong>,{' '}
                      <strong>Claude Code</strong>, <strong>Cursor</strong>, <strong>Antigravity</strong>, etc.). Ya
                      incluye el objetivo, tus respuestas, tus imágenes de diseño, el stack recomendado y el plan paso a
                      paso.
                    </p>
                  </div>

                  <div className="giant-copy-box">
                    <button
                      type="button"
                      className={`btn-primary btn-hero ${copiedBanner ? 'btn-copied-success' : ''}`}
                      onClick={() => handleCopyMasterPrompt()}
                    >
                      {copiedBanner
                        ? '✓ ¡Copiado! Pegalo en tu Agente'
                        : '📋 Copiar Súper Prompt para mi Agente'}
                    </button>
                  </div>
                </div>

                {/* Resumen visual rápido de 3 tarjetas de lo que contiene el proyecto */}
                <div className="three-col-grid summary-pillars">
                  <div className="pillar-box">
                    <div className="exec-label">QUÉ VA A CONSTRUIR EL AGENTE</div>
                    <strong>{currentProject.brief.title}</strong>
                    <div className="muted-tiny">{currentProject.brief.objective}</div>
                  </div>
                  <div className="pillar-box">
                    <div className="exec-label">TECNOLOGÍAS ELEGIDAS</div>
                    <strong>{selectedStackOption?.name}</strong>
                    <div className="muted-tiny">
                      {selectedStackOption?.components.frontend} · {selectedStackOption?.components.storage}
                    </div>
                  </div>
                  <div className="pillar-box">
                    <div className="exec-label">PLAN Y REFERENCIAS VISUALES</div>
                    <strong>
                      {currentProject.brief.mvpScope.length} funciones principales ·{' '}
                      {currentProject.inputImages?.length || 0} imagen(es)
                    </strong>
                    <div className="muted-tiny">
                      {currentProject.tasks.length} pasos ordenados con verificación incluida
                    </div>
                  </div>
                </div>

                {/* Si el usuario subió imágenes, mostrarlas acá también como referencia activa */}
                {currentProject.inputImages && currentProject.inputImages.length > 0 && (
                  <div className="active-images-bar">
                    <strong>🖼️ Imágenes de referencia incluidas en el diseño:</strong>
                    <div className="mini-thumbs-row">
                      {currentProject.inputImages.map((img, i) => (
                        <div key={img.id} className="mini-thumb-item">
                          <img src={img.dataUrl} alt={img.fileName} />
                          <span>
                            Img {i + 1}: {img.userNote || img.fileName}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* CUADRO DEL SÚPER PROMPT EDITABLE Y COPIABLE */}
                <div className="master-prompt-container">
                  <div className="master-prompt-toolbar">
                    <strong>Prompt Maestro Completo (podés editar cualquier palabra antes de copiarlo):</strong>
                    <div className="button-row">
                      <button
                        type="button"
                        className="btn-secondary btn-small"
                        onClick={() => setWizardStep('questions')}
                      >
                        ← Volver a las preguntas
                      </button>
                      <button
                        type="button"
                        className="btn-primary btn-small"
                        onClick={() => handleCopyMasterPrompt()}
                      >
                        📋 Copiar Todo
                      </button>
                    </div>
                  </div>
                  <textarea
                    className="master-prompt-textarea"
                    rows={18}
                    value={editableMasterPrompt}
                    onChange={(e) => setEditableMasterPrompt(e.target.value)}
                  />
                </div>

                {/* ACCIONES PRÁCTICAS EN 1 CLIC */}
                <div className="quick-delivery-bar">
                  <div className="quick-delivery-left">
                    <strong>¿Querés además dejar la carpeta y las herramientas listas en tu PC?</strong>
                    <span className="muted-tiny">
                      Guarda el archivo <code>PROMPT-MAESTRO-AGENTE.md</code>, <code>AGENTS.md</code> y los documentos en
                      tu carpeta o configura tu agente local automáticamente.
                    </span>
                  </div>
                  <div className="button-row">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => handleExportLocal(false)}
                    >
                      💾 Guardar Proyecto en Carpeta Local
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => handleApplyEnvironment()}
                    >
                      ⚡ Configurar Skills/MCP en mi Agente Local
                    </button>
                    <a
                      className="btn-secondary"
                      href={`/api/projects/${encodeURIComponent(currentProject.id)}/export/bundle`}
                      download
                    >
                      ⬇️ Descargar Paquete (.json)
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* BOTÓN PARA ABRIR / CERRAR LAS PESTAÑAS TÉCNICAS AVANZADAS */}
            <div className="advanced-toggle-bar">
              <button
                type="button"
                className="btn-secondary btn-full-width"
                onClick={() => setShowAdvancedTabs((v) => !v)}
              >
                {showAdvancedTabs
                  ? '▲ Ocultar paneles técnicos avanzados (Investigación, Comparador de Stack, REA, Catálogo y Documentos)'
                  : '🔍 Ver o ajustar detalles técnicos avanzados (Investigación web/GitHub, Comparar otros Stacks, REA, Skills/MCP y Documentos)'}
              </button>
            </div>

            {/* ================================================================
                MODO AVANZADO DESPLEGABLE (LAS 5 PESTAÑAS COMPLETAS)
               ================================================================ */}
            {showAdvancedTabs && (
              <div className="advanced-section-wrapper">
                <nav className="tabs-bar" aria-label="Secciones técnicas avanzadas">
                  <button
                    type="button"
                    className={`tab-btn ${activeTab === 'brief' ? 'active' : ''}`}
                    onClick={() => setActiveTab('brief')}
                  >
                    1. Brief Detallado
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
                    3. Comparación de Stack (7 Dimensiones)
                  </button>
                  <button
                    type="button"
                    className={`tab-btn ${activeTab === 'environment' ? 'active' : ''}`}
                    onClick={() => setActiveTab('environment')}
                  >
                    4. Catálogo y Clientes ({selectedCatalogIds.length})
                  </button>
                  <button
                    type="button"
                    className={`tab-btn ${activeTab === 'docs' ? 'active' : ''}`}
                    onClick={() => setActiveTab('docs')}
                  >
                    5. Todos los Documentos, Roles y Git
                  </button>
                </nav>

                {/* PESTAÑA 1: BRIEF EDITABLE DETALLADO */}
                {activeTab === 'brief' && (
                  <div className="tab-panel">
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
                      </div>

                      <div className="card">
                        <h4>Restricciones Comprobables</h4>
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
                        </div>
                      </div>
                    </div>

                    <div className="card">
                      <h3>Editar Alcance Detallado (MVP vs Mejoras Futuras)</h3>
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label htmlFor="edit-mvp">Funciones principales del MVP (una por línea)</label>
                          <textarea
                            id="edit-mvp"
                            rows={4}
                            value={editMvpFeatures}
                            onChange={(e) => setEditMvpFeatures(e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="edit-future">Mejoras para más adelante (una por línea)</label>
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
                          onClick={() => handleUpdateBriefAndGoToPrompt(false)}
                        >
                          Guardar y Actualizar Súper Prompt
                        </button>
                      </div>
                    </div>

                    {revisions.length > 0 && (
                      <div className="card">
                        <h4>Historial de Revisiones ({revisions.length})</h4>
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
                      <h3>Motor de Investigación Profunda con Fuentes Comprobables</h3>
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
                          <label htmlFor="res-time">Tiempo máx. (seg)</label>
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
                          <label htmlFor="res-reqs">Máx. consultas</label>
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
                            Investigar Ahora
                          </button>
                          {latestResearchRun &&
                            (latestResearchRun.status === 'cancelled' || latestResearchRun.status === 'paused') && (
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => handleStartOrResumeResearch(latestResearchRun.id)}
                              >
                                Reanudar
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
                              <strong>Consumo:</strong> {latestResearchRun.elapsedMs}ms ·{' '}
                              {latestResearchRun.requestsUsed}/{latestResearchRun.budget.maxNetworkRequests} reqs (
                              {latestResearchRun.reusedCachedCount} de caché)
                            </span>
                          </div>
                          <div className="x-coverage-banner">
                            <strong>Cobertura de X [{latestResearchRun.xCoverageStatus}]:</strong>{' '}
                            {latestResearchRun.xCoverageNote}
                          </div>
                        </div>
                      )}
                    </div>

                    {latestResearchRun && latestResearchRun.evidenceItems.length > 0 && (
                      <div className="card">
                        <div className="card-header-flex">
                          <h3>Fuentes y Repositorios Encontrados ({latestResearchRun.evidenceItems.length})</h3>
                          <div className="filter-pills">
                            {[
                              ['all', 'Todas'],
                              ['open_source_repo', 'Repos GitHub'],
                              ['tech_option', 'Documentación'],
                              ['mcp_skill_tool', 'MCP y Skills'],
                              ['community_x', 'X'],
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
                                    <h4>
                                      <a href={ev.url} target="_blank" rel="noreferrer">
                                        {ev.title} ↗
                                      </a>
                                    </h4>
                                  </div>
                                  <div className="muted-tiny">
                                    {new Date(ev.consultedAt).toLocaleDateString('es-AR')}
                                  </div>
                                </div>
                                <p>{ev.summary}</p>
                                {ev.repoMetadata && (
                                  <div className="repo-metadata-box">
                                    <strong>Repo:</strong> {ev.repoMetadata.fullName} · <strong>Commit:</strong>{' '}
                                    <code>{ev.repoMetadata.versionOrCommit}</code> · <strong>Licencia:</strong>{' '}
                                    {ev.repoMetadata.license}
                                  </div>
                                )}
                              </article>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* FICHAS REA */}
                    <div className="card">
                      <h3>REA — Análisis de Aplicaciones de Referencia</h3>
                      <div className="rea-analyzer-bar">
                        <input
                          type="text"
                          placeholder="Ruta local a analizar con REA"
                          value={reaTargetInput}
                          onChange={(e) => setReaTargetInput(e.target.value)}
                        />
                        <input
                          type="text"
                          placeholder="¿Qué patrón querés observar?"
                          value={reaNeedInput}
                          onChange={(e) => setReaNeedInput(e.target.value)}
                        />
                        <button type="button" className="btn-secondary" onClick={handleRunLiveReaAnalysis}>
                          Analizar con REA
                        </button>
                      </div>

                      <div className="rea-cards-grid">
                        {currentProject.reaCards.map((card) => (
                          <article key={card.id} className="rea-card">
                            <div className="rea-card-header">
                              <div>
                                <span className="badge badge-info">Decisión: {card.decision.toUpperCase()}</span>
                                <span className="badge badge-neutral">{card.toolUsed}</span>
                                <h4>{card.targetName}</h4>
                              </div>
                            </div>
                            <div className="rea-three-layers">
                              <div className="rea-layer layer-obs">
                                <h5>1. Observaciones</h5>
                                <ul>
                                  {card.epistemic.observations.map((o, i) => (
                                    <li key={i}>{o}</li>
                                  ))}
                                </ul>
                              </div>
                              <div className="rea-layer layer-inf">
                                <h5>2. Inferencias</h5>
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
                          </article>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* PESTAÑA 3: COMPARACIÓN DE STACK */}
                {activeTab === 'stack' && currentProject.stackComparison && (
                  <div className="tab-panel">
                    <div className="card">
                      <h3>Cambiar Prioridad para Recalcular el Stack Recomendado</h3>
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
                    </div>

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
                                {isSelected && <span className="badge badge-success">★ Elegido</span>}
                                {opt.disqualifiedByHardConstraint && (
                                  <span className="badge badge-danger">Descalificado por restricción</span>
                                )}
                                <h4>{opt.name}</h4>
                              </div>
                              <div className="composite-score-circle">
                                <span>{opt.weightedScore}</span>
                                <small>/100</small>
                              </div>
                            </div>
                            <p className="muted-sub">{opt.tagline}</p>
                            <div className="cost-estimate-box">
                              <strong>Costo:</strong> {opt.costEstimate.monthlyRangeUsd}
                            </div>
                            {!opt.disqualifiedByHardConstraint && !isSelected && (
                              <button
                                type="button"
                                className="btn-secondary btn-small"
                                onClick={() => handleUpdateStack({ selectedOptionId: opt.id })}
                              >
                                Usar este stack en el Súper Prompt
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="card">
                      <h3>Comparativa en las 7 Dimensiones</h3>
                      <div className="table-responsive">
                        <table className="comparison-table">
                          <thead>
                            <tr>
                              <th>Dimensión</th>
                              <th>Peso</th>
                              {currentProject.stackComparison.options.map((opt) => (
                                <th key={opt.id}>{opt.name}</th>
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
                                          {Math.round(cell.scoreNormalized * 100)}/100
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

                    {ownStackDecision && (
                      <div className="card">
                        <h4>{ownStackDecision.title}</h4>
                        <p>{ownStackDecision.rationale}</p>
                        <p className="muted-tiny">{ownStackDecision.separationPrinciple}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* PESTAÑA 4: CATÁLOGO Y CLIENTES */}
                {activeTab === 'environment' && (
                  <div className="tab-panel">
                    {overlapWarnings.length > 0 && (
                      <div className="status-banner warning-banner">
                        <div>
                          <strong>Solapamiento detectado:</strong> {overlapWarnings.join(' · ')}
                        </div>
                      </div>
                    )}

                    <div className="card">
                      <div className="card-header-flex">
                        <div>
                          <h3>Preparar Agente Local (Codex, Cursor, Claude Code)</h3>
                          <p className="muted-sub">
                            Instala las skills y servidores MCP recomendados con respaldo reversible SHA-256.
                          </p>
                        </div>
                        <div className="button-row">
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={() => handleApplyEnvironment()}
                          >
                            Preparar Entorno Ahora
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
                        <div key={plan.id} className="table-responsive">
                          <table className="comparison-table">
                            <thead>
                              <tr>
                                <th>Cliente</th>
                                <th>Capacidad</th>
                                <th>Ruta</th>
                                <th>Estado</th>
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
                                    <td>{act.capabilityName}</td>
                                    <td>
                                      <code>{act.targetPath}</code>
                                    </td>
                                    <td>
                                      <span className={`badge ${st.badgeClass}`}>{st.label}</span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ))}
                    </div>

                    <div className="card">
                      <div className="card-header-flex">
                        <h3>Catálogo de Herramientas, Skills y MCP ({catalog.length})</h3>
                        <div className="button-row">
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => setShowNewCatalogForm((v) => !v)}
                          >
                            + Agregar al Catálogo
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
                          <div className="form-grid-2">
                            <input
                              type="text"
                              required
                              placeholder="Nombre de la herramienta"
                              value={newCatName}
                              onChange={(e) => setNewCatName(e.target.value)}
                            />
                            <select
                              value={newCatKind}
                              onChange={(e) => setNewCatKind(e.target.value as CapabilityKind)}
                            >
                              <option value="skill">Skill</option>
                              <option value="mcp">Servidor MCP</option>
                              <option value="cli_tool">CLI</option>
                              <option value="library_template">Librería</option>
                            </select>
                          </div>
                          <div className="form-grid-2" style={{ marginTop: '8px' }}>
                            <input
                              type="text"
                              required
                              placeholder="URL o ruta local"
                              value={newCatUrl}
                              onChange={(e) => setNewCatUrl(e.target.value)}
                            />
                            <input
                              type="text"
                              required
                              placeholder="Descripción breve"
                              value={newCatDesc}
                              onChange={(e) => setNewCatDesc(e.target.value)}
                            />
                          </div>
                          <button type="submit" className="btn-primary btn-small" style={{ marginTop: '8px' }}>
                            Guardar en Catálogo
                          </button>
                        </form>
                      )}

                      <div className="catalog-filters-bar">
                        <div className="filter-pills">
                          {(
                            [
                              ['all', 'Todos'],
                              ['skill', 'Skills'],
                              ['mcp', 'MCP'],
                              ['cli_tool', 'CLI'],
                              ['library_template', 'Librerías'],
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
                          placeholder="Buscar..."
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
                                  <span className="badge badge-info">{item.kind}</span>
                                </div>
                                <p className="compact-p">{item.description}</p>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                )}

                {/* PESTAÑA 5: DOCUMENTOS, ROLES Y ENTREGA */}
                {activeTab === 'docs' && (
                  <div className="tab-panel">
                    <div className="card">
                      <h3>Prompts Individuales por Rol de Agente</h3>
                      <div className="roles-pills-row">
                        {currentProject.agentRoles.map((role) => (
                          <div key={role.id} className="role-badge-card">
                            <div className="card-header-flex">
                              <strong>{role.title}</strong>
                              <button
                                type="button"
                                className="btn-secondary btn-small"
                                onClick={() => handleCopyMasterPrompt(role.readyPromptForAgent)}
                              >
                                📋 Copiar Prompt de este Rol
                              </button>
                            </div>
                            <span className="muted-tiny">{role.objective}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="card">
                      <h3>Archivos Generados del Proyecto ({currentProject.generatedArtifacts.length})</h3>
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
                              <span className="muted-tiny">v{art.sourceBriefRevision}</span>
                            </button>
                          ))}
                        </div>
                        <div className="doc-content-pane">
                          {currentProject.generatedArtifacts[selectedArtifactIndex] && (
                            <>
                              <div className="doc-pane-header">
                                <strong>{currentProject.generatedArtifacts[selectedArtifactIndex].title}</strong>
                                <button
                                  type="button"
                                  className="btn-secondary btn-small"
                                  onClick={() =>
                                    handleCopyMasterPrompt(
                                      currentProject.generatedArtifacts[selectedArtifactIndex].content
                                    )
                                  }
                                >
                                  Copiar archivo
                                </button>
                              </div>
                              <pre className="doc-pre-code">
                                {currentProject.generatedArtifacts[selectedArtifactIndex].content}
                              </pre>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="card">
                      <h3>Guardar en Carpeta o Rama Git</h3>
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
                              Guardar Archivos
                            </button>
                          </div>
                        </div>
                        <div className="form-group">
                          <label>Rama Git</label>
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
                              Crear Rama Git
                            </button>
                          </div>
                        </div>
                      </div>
                      {localExportStatus && (
                        <div className="export-result-box" style={{ marginTop: '10px' }}>
                          <strong>Archivos guardados ({localExportStatus.writtenFiles.length}):</strong>{' '}
                          <code>{localExportStatus.writtenFiles.join(', ')}</code>
                        </div>
                      )}
                      {gitSyncStatus && (
                        <div className="export-result-box" style={{ marginTop: '10px' }}>
                          <strong>Git:</strong> {gitSyncStatus.message}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ====================================================================
            VISTA DE CONEXIONES (JEV DE TYPESAFE, REA, ETC.)
           ==================================================================== */}
        {mainView === 'connections' && (
          <div className="content-container">
            <header className="hero-intake-header">
              <h2>Conexiones y Estado de Herramientas</h2>
              <p>
                Tus claves se leen de forma segura desde tu usuario de Windows o desde el almacén local privado y nunca
                se suben a Git.
              </p>
            </header>

            <div className="connections-grid">
              {connections.map((conn) => (
                <div key={conn.provider} className="card connection-card">
                  <div className="card-header-flex">
                    <h4>{conn.displayName}</h4>
                    <span className={`badge ${conn.configured ? 'badge-success' : 'badge-warning'}`}>
                      {conn.configured ? `Activo (${conn.sourceScope})` : 'Opcional / No configurado'}
                    </span>
                  </div>
                  <p className="compact-p">{conn.statusMessage}</p>
                  {conn.maskedHint && (
                    <div className="muted-tiny">
                      Clave detectada: <code>{conn.maskedHint}</code>
                    </div>
                  )}

                  {conn.provider === 'typesafe' && (
                    <div className="connection-actions-box">
                      <div className="input-with-btn">
                        <input
                          type="password"
                          placeholder="Cambiar TYPESAFE_API_KEY (opcional)"
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
                          Guardar
                        </button>
                        <button type="button" className="btn-primary" onClick={handleProbeTypeSafe}>
                          Probar Conexión
                        </button>
                      </div>
                      {probeResponseDetail && <div className="probe-success-note">✓ {probeResponseDetail}</div>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
