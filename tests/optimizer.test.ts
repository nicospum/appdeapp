import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import {
  initDatabase,
  closeDatabase,
  getProjectById as getProjectFromDb,
  getBriefRevisions,
  listJevEvaluations,
} from '../src/server/storage/db.js';
import {
  resolveSecret,
  sanitizeAndAssertNoSecrets,
} from '../src/server/config/secrets.js';
import {
  probeTypeSafeConnection,
  suggestSkillsWithJevCookbook,
} from '../src/server/providers/jev-service.js';
import {
  inspectReaSystemStatus,
  analyzeLocalJsTargetWithRea,
} from '../src/server/providers/rea-adapter.js';
import {
  ensureCatalogSeeded,
  validateAndAddCustomCatalogEntry,
} from '../src/server/catalog/catalog-service.js';
import {
  startOrResumeResearchRun,
  cancelResearchRun,
} from '../src/server/research/research-engine.js';
import {
  OPTIMIZER_OWN_STACK_DECISION,
} from '../src/server/stack/stack-comparator.js';
import {
  buildEnvironmentPreparationPlan,
  applyEnvironmentPreparationPlan,
  revertEnvironmentBackup,
} from '../src/server/environment/client-adapters.js';
import {
  createFullProject,
  getProjectById,
  updateProjectBrief,
  updateProjectStackDecision,
  applyArtifactsToLocalDirectory,
  prepareGitHubBranchDelivery,
} from '../src/server/project/project-service.js';

const tmpTestRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-test-suite-'));
const testDbPath = path.join(tmpTestRoot, 'test-forja.sqlite');

describe('Forja — Suite Completa de Verificación Funcional y Técnica (11 Escenarios)', () => {
  beforeAll(() => {
    initDatabase(testDbPath);
    ensureCatalogSeeded();
  });

  afterAll(() => {
    closeDatabase();
    try {
      fs.rmSync(tmpTestRoot, { recursive: true, force: true });
    } catch {
      // Ignorar limpieza en Windows si algún descriptor sigue cerrándose
    }
  });

  it('1. Idea mínima: genera una propuesta inicial útil a partir de una sola frase, con supuestos visibles y <= 2 preguntas', async () => {
    const project = await createFullProject({
      mode: 'new_project',
      inputRaw: 'Quiero una app para organizar mis notas técnicas y fragmentos de código con búsqueda rápida.',
      inputUrls: [],
      destinationType: 'local',
    });

    expect(project.id).toBeTruthy();
    expect(project.brief.objective.length).toBeGreaterThan(15);
    expect(project.brief.explicitFacts.length).toBeGreaterThanOrEqual(1);
    expect(project.brief.inferredAssumptions.length).toBeGreaterThanOrEqual(2);
    // Regla crítica: máximo 2 preguntas abiertas por interacción, cada una con opción recomendada
    const openQuestions = project.brief.clarifyingQuestions.filter((q) => q.status === 'open');
    expect(openQuestions.length).toBeLessThanOrEqual(2);
    expect(openQuestions.length).toBeGreaterThanOrEqual(1);
    for (const q of openQuestions) {
      expect(q.options.some((o) => o.recommended)).toBe(true);
    }
    // Alcance inicial realizable (MVP) separado de mejoras posteriores
    expect(project.brief.mvpScope.length).toBeGreaterThanOrEqual(2);
    expect(project.brief.futureImprovements.length).toBeGreaterThanOrEqual(1);
    // Verifica que también se genere el Súper Prompt Maestro para el Agente Programador
    expect(project.masterAgentPrompt).toBeTruthy();
    expect(project.masterAgentPrompt).toContain('PROMPT MAESTRO DE CONSTRUCCIÓN');
    expect(project.masterAgentPrompt).toContain('Agente Programador');
    expect(
      project.generatedArtifacts.some((a) => a.relativePath === 'PROMPT-MAESTRO-AGENTE.md')
    ).toBe(true);
  }, 45000);

  it('1b. Carga de imágenes de referencia visual + Súper Prompt: integra las imágenes y notas del usuario en el brief y en el Prompt Maestro', async () => {
    const samplePngDataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const projectWithImages = await createFullProject({
      mode: 'new_project',
      inputRaw: 'Quiero una app de gestión de turnos con un calendario semanal limpio como el de la imagen adjunta.',
      inputUrls: [],
      inputImages: [
        {
          id: 'img_ref_01',
          fileName: 'calendario-referencia.png',
          mimeType: 'image/png',
          dataUrl: samplePngDataUrl,
          sizeBytes: 96,
          userNote: 'Usar barra lateral oscura y tarjetas de turnos con código de color por estado',
        },
      ],
      destinationType: 'local',
    });

    expect(projectWithImages.inputImages?.length).toBe(1);
    expect(projectWithImages.brief.explicitFacts.some((f) => f.includes('calendario-referencia.png'))).toBe(true);
    expect(projectWithImages.masterAgentPrompt).toContain('calendario-referencia.png');
    expect(projectWithImages.masterAgentPrompt).toContain(
      'Usar barra lateral oscura y tarjetas de turnos con código de color por estado'
    );
  }, 45000);

  it('2. Descripción detallada: respeta restricciones explícitas (Windows, $0/mes, privacidad local) y descalifica opciones incompatibles', async () => {
    const detailedProject = await createFullProject({
      mode: 'new_project',
      inputRaw:
        'Herramienta de escritorio/local en Windows con SQLite local, presupuesto $0 gratis sin suscripción mensual y privacidad estricta sin nube ni telemetría externa para auditar configuraciones de agentes.',
      inputUrls: ['https://docs.typesafe.ai'],
      destinationType: 'local',
    });

    expect(detailedProject.brief.constraints.targetOs.toLowerCase()).toContain('windows');
    expect(detailedProject.brief.constraints.budgetLimit).toContain('$0');
    expect(detailedProject.brief.constraints.executionMode).toBe('local_only');
    expect(detailedProject.brief.constraints.privacyLevel).toBe('strict_local');

    // Verifica que la opción cloud/SaaS quede descalificada por restricción dura y NO pueda ganar
    const cloudOpt = detailedProject.stackComparison?.options.find(
      (o) => o.id === 'opt_cloud_web_plus_local_daemon'
    );
    expect(cloudOpt).toBeDefined();
    expect(cloudOpt?.disqualifiedByHardConstraint).toBe(true);
    expect(cloudOpt?.disqualificationReason).toBeTruthy();
    expect(detailedProject.stackComparison?.recommendedOptionId).not.toBe('opt_cloud_web_plus_local_daemon');

    // También verifica que la decisión del propio optimizador esté documentada por separado
    expect(OPTIMIZER_OWN_STACK_DECISION.chosenStack.length).toBeGreaterThan(2);
    expect(OPTIMIZER_OWN_STACK_DECISION.separationPrinciple).toContain('dependencia permanente');
  }, 45000);

  it('3. Proyecto existente (Modo 2): inspecciona arquitectura, convenciones y pruebas sin rehacer el proyecto ni cambiar su stack', async () => {
    const existingPath = 'c:\\Users\\User\\Desktop\\spum\\AI Studio Pro';
    const existingProject = await createFullProject({
      mode: 'existing_feature',
      inputRaw: 'Agregar exportación de historial de sesiones en JSON respetando los módulos actuales.',
      existingProjectPath: existingPath,
      inputUrls: [],
      destinationType: 'local',
    });

    expect(existingProject.existingInspection).toBeDefined();
    expect(existingProject.existingInspection?.exists).toBe(true);
    expect(existingProject.existingInspection?.detectedStack.join(' ')).toContain('JavaScript');
    expect(existingProject.existingInspection?.minimalChangeProposal.stackPreserved).toBe(true);

    // En Modo 2, la opción recomendada preserva el stack existente
    expect(existingProject.stackComparison?.recommendedOptionId).toBe('opt_local_web_node_sqlite');
    const recommendedOpt = existingProject.stackComparison?.options.find(
      (o) => o.id === existingProject.stackComparison?.recommendedOptionId
    );
    expect(recommendedOpt?.name).toContain('Conservar Stack Existente');
  }, 45000);

  it('4. Investigación profunda: guarda fuentes reales con fecha, enlace, commit/licencia de GitHub, usa caché SQLite y permite cancelar/reanudar', async () => {
    const project = await createFullProject({
      mode: 'new_project',
      inputRaw: 'Aplicación para gestionar skills de agentes y servidores MCP con evaluación Jev.',
      inputUrls: [],
      destinationType: 'local',
    });

    // Primera ejecución normal
    const run1 = await startOrResumeResearchRun({
      projectId: project.id,
      depth: 'normal',
      maxDurationSeconds: 45,
      maxNetworkRequests: 15,
      reuseCache: true,
    });

    expect(run1.status).toBe('completed');
    expect(run1.evidenceItems.length).toBeGreaterThanOrEqual(4);

    // Verificar URL, fecha de consulta, relación con necesidad del proyecto y metadatos de GitHub
    const githubEv = run1.evidenceItems.find((e) => e.sourceType === 'github_repo' && e.repoMetadata);
    expect(githubEv).toBeDefined();
    expect(githubEv?.url).toMatch(/^https:\/\/github\.com\//);
    expect(githubEv?.consultedAt).toBeTruthy();
    expect(githubEv?.projectNeedRelation.length).toBeGreaterThan(10);
    expect(githubEv?.repoMetadata?.versionOrCommit).toBeTruthy();
    expect(githubEv?.repoMetadata?.license).toBeTruthy();
    expect(githubEv?.repoMetadata?.starsNote).toContain('estrellas');

    // Ejecutar una corrida con presupuesto inicialmente acotado (maxDurationSeconds: 0.001) para pausar en el primer paso,
    // cancelarla explícitamente y luego reanudarla con presupuesto completo verificando reutilización de caché SQLite
    const pausedRun = await startOrResumeResearchRun({
      projectId: project.id,
      depth: 'fast',
      maxDurationSeconds: 0.0001,
      maxNetworkRequests: 1,
      reuseCache: true,
    });
    expect(pausedRun.status).toBe('paused');

    const cancelled = cancelResearchRun(project.id, pausedRun.id);
    expect(cancelled?.status).toBe('cancelled');

    const resumed = await startOrResumeResearchRun({
      projectId: project.id,
      resumeRunId: pausedRun.id,
      maxDurationSeconds: 45,
      maxNetworkRequests: 15,
      reuseCache: true,
    });
    expect(resumed.status).toBe('completed');
    expect(resumed.reusedCachedCount).toBeGreaterThanOrEqual(1);
  }, 60000);

  it('5. Jev de TypeSafe: verifica conexión en vivo (/v1/models y /v1/systemone), cookbook de 2 pasadas y manejo honesto de clave inválida sin inventar puntajes', async () => {
    const tsSecret = resolveSecret('TYPESAFE_API_KEY');
    expect(tsSecret.value).toBeTruthy();

    // 5a. Probar conexión real con la API key del usuario
    const probeOk = await probeTypeSafeConnection();
    expect(probeOk.ok).toBe(true);
    expect(probeOk.models.some((m) => m.name === 'jev-latest')).toBe(true);
    expect(probeOk.probeEvaluation.status).toBe('success');
    expect(probeOk.probeEvaluation.modelRequested).toBe('jev-latest');
    expect(probeOk.probeEvaluation.modelUsed).toMatch(/^jev-/);

    // 5b. Cookbook de 2 pasadas para sugerencia de skills
    const project = await createFullProject({
      mode: 'new_project',
      inputRaw: 'Herramienta para evaluar decisiones con Jev de TypeSafe y analizar código con REA.',
      destinationType: 'local',
    });
    const catalog = ensureCatalogSeeded();
    const skillCandidates = catalog.filter((c) => c.kind === 'skill');

    const skillSelection = await suggestSkillsWithJevCookbook(
      project.id,
      project.brief,
      skillCandidates
    );
    expect(skillSelection.pass1Record.status).toBe('success');

    // 5c. Manejo de error con clave inválida: jamás inventar puntajes
    const probeInvalid = await probeTypeSafeConnection('ts_invalid_fake_key_0000000000');
    expect(probeInvalid.ok).toBe(false);
    expect(probeInvalid.probeEvaluation.status).not.toBe('success');
    expect(Object.keys(probeInvalid.probeEvaluation.answers).length).toBe(0);
    expect(probeInvalid.probeEvaluation.errorMessage).toBeTruthy();

    // 5d. Verificar que la tabla jev_evaluations no contenga la API key en ningún registro
    const allEvals = listJevEvaluations();
    const serialized = JSON.stringify(allEvals);
    if (tsSecret.value) {
      expect(serialized.includes(tsSecret.value)).toBe(false);
    }
  }, 60000);

  it('6. REA (Reverse Engineer Anything): verifica estado CLI/skill y genera ficha real separando Observaciones, Inferencias y Reproducciones comprobadas', async () => {
    const status = await inspectReaSystemStatus(true);
    expect(status.cliInstalled).toBe(true);
    expect(status.cliVersion).toBe('6.8.0');
    expect(status.skillAligned).toBe(true);

    const card = await analyzeLocalJsTargetWithRea(
      'test-rea-proj',
      'c:\\Users\\User\\Desktop\\spum\\AI Studio Pro',
      'Estudiar organización modular de vistas y estado local'
    );

    expect(card.evidenceId).toMatch(/^(rea-|ev_|inv-)/);
    expect(card.artifactSha256).toBeTruthy();
    expect(card.epistemic.observations.length).toBeGreaterThanOrEqual(1);
    expect(card.epistemic.inferences.length).toBeGreaterThanOrEqual(1);
    expect(card.epistemic.verifiedReproductions.length).toBeGreaterThanOrEqual(1);
    expect(card.analysisLimits.length).toBeGreaterThanOrEqual(1);
    expect(card.licenseAndAttribution.reaLicenseDisclaimer).toContain('derechos');
  }, 45000);

  it('7. Instalación en cliente: instala skill y MCP en configuración de cliente aislada, preserva claves ajenas, es idempotente al repetir y revierte sus propios cambios', async () => {
    const fakeHomeDir = path.join(tmpTestRoot, 'fake-user-home');
    const codexDir = path.join(fakeHomeDir, '.codex');
    fs.mkdirSync(codexDir, { recursive: true });
    const configPath = path.join(codexDir, 'config.toml');
    const skillsDir = path.join(codexDir, 'skills');

    // Sembrar configuración preexistente del usuario que NO debe romperse ni borrarse
    const initialForeignToml = [
      'model = "gpt-5-codex"',
      '',
      '[mcp_servers.existing_user_server]',
      'command = "node"',
      'args = ["existing.js"]',
      '',
    ].join('\n');
    fs.writeFileSync(configPath, initialForeignToml, 'utf-8');

    const catalog = ensureCatalogSeeded();
    const selectedEntries = catalog.filter(
      (c) => c.id === 'skill:typesafe-ai' || c.id === 'mcp:rea'
    );
    const selections = selectedEntries.map((entry) => ({
      catalogId: entry.id,
      entry,
      classification: 'necessary' as const,
      classificationReason: 'Prueba de instalación real e idempotente',
      selectedForInstall: true,
    }));

    const plan = buildEnvironmentPreparationPlan({
      projectId: 'proj-env-test',
      briefRevision: 1,
      targetClients: ['codex'],
      selections,
      overrideHomeDir: fakeHomeDir,
    });

    // Primera aplicación
    const res1 = await applyEnvironmentPreparationPlan({
      plan,
      catalogEntries: catalog,
      overrideHomeDir: fakeHomeDir,
      skipLiveProcessProbe: true,
    });

    expect(res1.backupRecord.id).toBeTruthy();
    const afterApply1Toml = fs.readFileSync(configPath, 'utf-8');
    // Verifica que la configuración preexistente siga intacta
    expect(afterApply1Toml).toContain('[mcp_servers.existing_user_server]');
    // Verifica que se haya agregado el servidor MCP y creado el archivo SKILL.md
    expect(afterApply1Toml).toContain('[mcp_servers.rea]');
    expect(fs.existsSync(path.join(skillsDir, 'typesafe-ai', 'SKILL.md'))).toBe(true);
    expect(
      res1.updatedPlan.actions.every(
        (a) => a.stage === 'tested_verified' || a.stage === 'recognized_by_client'
      )
    ).toBe(true);

    // Segunda aplicación (Idempotencia: no debe duplicar secciones TOML)
    const res2 = await applyEnvironmentPreparationPlan({
      plan: res1.updatedPlan,
      catalogEntries: catalog,
      overrideHomeDir: fakeHomeDir,
      skipLiveProcessProbe: true,
    });
    const afterApply2Toml = fs.readFileSync(configPath, 'utf-8');
    const occurrences = afterApply2Toml.split('[mcp_servers.rea]').length - 1;
    expect(occurrences).toBe(1);
    expect(res2.updatedPlan.actions.length).toBeGreaterThan(0);

    // Reversión limpia usando el backupRecord original
    const revertRes = revertEnvironmentBackup(res1.backupRecord);
    expect(revertRes.revertedFiles.length).toBeGreaterThan(0);
    const afterRevertToml = fs.readFileSync(configPath, 'utf-8');
    expect(afterRevertToml.trim()).toBe(initialForeignToml.trim());
    expect(fs.existsSync(path.join(skillsDir, 'typesafe-ai', 'SKILL.md'))).toBe(false);
  }, 45000);

  it('8. GitHub y ramas: prepara una rama coherente sin secretos y detecta conflictos de commit base sin pisar trabajo existente', async () => {
    const project = await createFullProject({
      mode: 'new_project',
      inputRaw: 'Utilidad CLI en TypeScript para validar esquemas JSON y generar reportes.',
      inputUrls: [],
      destinationType: 'github',
    });

    const gitRepoDir = path.join(tmpTestRoot, 'git-delivery-repo');
    fs.mkdirSync(gitRepoDir, { recursive: true });

    const sync1 = prepareGitHubBranchDelivery({
      project,
      targetDirectory: gitRepoDir,
      branchName: 'forja/entrega-inicial',
    });

    expect(sync1.status).toBe('prepared_local_branch_pending_remote');
    expect(sync1.secretsScanPassed).toBe(true);
    expect(sync1.newCommitSha).toBeTruthy();
    expect(fs.existsSync(path.join(gitRepoDir, 'AGENTS.md'))).toBe(true);
    expect(fs.existsSync(path.join(gitRepoDir, 'docs', '01-brief-y-alcance.md'))).toBe(true);

    // Simular un nuevo commit externo y verificar que expectedBaseCommit desactualizado detecte el conflicto sin sobrescribir
    fs.writeFileSync(path.join(gitRepoDir, 'NOTA_USUARIO.md'), 'Trabajo manual del usuario\n', 'utf-8');
    execSync('git add NOTA_USUARIO.md && git commit -m "Commit manual externo"', {
      cwd: gitRepoDir,
      stdio: 'pipe',
    });

    const syncConflict = prepareGitHubBranchDelivery({
      project,
      targetDirectory: gitRepoDir,
      branchName: 'forja/entrega-inicial',
      expectedBaseCommit: '0000000',
    });

    expect(syncConflict.status).toBe('conflict_detected');
  }, 45000);

  it('9. Persistencia SQLite: cierra y reabre la base de datos conservando proyectos, revisiones e investigaciones', async () => {
    const created = await createFullProject({
      mode: 'new_project',
      inputRaw: 'Monitor local de procesos y puertos en Windows con alertas.',
      inputUrls: [],
      destinationType: 'local',
    });

    await updateProjectBrief(created.id, {
      objective: 'Objetivo actualizado en revisión #2 para probar persistencia tras reinicio',
      advanceWithAssumptions: true,
    });

    // Cerrar conexión SQLite y volver a abrirla desde el archivo en disco
    closeDatabase();
    initDatabase(testDbPath);

    const reopened = getProjectById(created.id);
    expect(reopened).toBeDefined();
    expect(reopened?.brief.revision).toBe(2);
    expect(reopened?.brief.objective).toContain('revisión #2');

    const revs = getBriefRevisions(created.id);
    expect(revs.length).toBe(2);
    expect(getProjectFromDb(created.id)).toBeDefined();
  }, 45000);

  it('10. Cambio de decisión: al cambiar prioridad o stack elegido, recalcula artefactos, incrementa revisión y marca secciones para revalidación', async () => {
    const project = await createFullProject({
      mode: 'new_project',
      inputRaw: 'Aplicación web modular para organizar referencias de diseño y componentes UI.',
      inputUrls: [],
      destinationType: 'local',
    });

    const initialRev = project.brief.revision;
    const alternativeOption = project.stackComparison?.options.find(
      (o) => !o.disqualifiedByHardConstraint && o.id !== project.stackComparison?.selectedOptionId
    );
    expect(alternativeOption).toBeDefined();

    const updated = await updateProjectStackDecision(project.id, {
      preset: 'speed',
      selectedOptionId: alternativeOption!.id,
    });

    expect(updated.brief.revision).toBe(initialRev + 1);
    expect(updated.stackComparison?.activePreset).toBe('speed');
    expect(updated.stackComparison?.selectedOptionId).toBe(alternativeOption!.id);
    expect(updated.staleSectionsRequiringRevalidation.length).toBeGreaterThan(0);
    // Verificar que los artefactos generados estén sincronizados con la nueva revisión
    expect(updated.generatedArtifacts.every((a) => a.sourceBriefRevision === updated.brief.revision)).toBe(true);
  }, 45000);

  it('11. Manejo de límites, catálogo ampliable, detección de edición manual en disco y sanitización anti-secretos', async () => {
    // 11a. Ampliar el catálogo con una nueva entrada personalizada y verificar persistencia
    const addedEntry = validateAndAddCustomCatalogEntry({
      name: 'Inspector SQLite Personalizado',
      kind: 'cli_tool',
      sourceUrlOrPath: 'https://sqlite.org/cli.html',
      description: 'Herramienta CLI para inspeccionar tablas y ejecutar consultas de diagnóstico.',
      solvesNeed: 'Auditar el esquema SQLite local durante el desarrollo.',
      scopeCategory: 'dev_time_tool',
      license: 'Public Domain',
    });
    expect(addedEntry.id).toContain('cli_tool:');

    // 11b. Detectar edición manual en disco antes de sobrescribir archivos generados
    const project = await createFullProject({
      mode: 'new_project',
      inputRaw: 'Gestor local de tareas con sincronización Markdown.',
      inputUrls: [],
      destinationType: 'local',
    });

    const exportDir = path.join(tmpTestRoot, 'manual-edit-check');
    const firstWrite = applyArtifactsToLocalDirectory({
      project,
      targetDirectory: exportDir,
      overwriteManualEdits: false,
    });
    expect(firstWrite.writtenFiles.length).toBeGreaterThan(0);
    expect(firstWrite.preservedManualFiles.length).toBe(0);

    // El usuario edita manualmente AGENTS.md en disco
    const agentsFilePath = path.join(exportDir, 'AGENTS.md');
    fs.appendFileSync(agentsFilePath, '\n## Regla Manual Agregada por el Usuario\nNo borrar esta sección.\n', 'utf-8');

    // Al intentar exportar de nuevo con overwriteManualEdits=false, debe detectar la edición manual y mostrar diff
    const secondWrite = applyArtifactsToLocalDirectory({
      project,
      targetDirectory: exportDir,
      overwriteManualEdits: false,
    });
    expect(secondWrite.preservedManualFiles.some((c) => c.relativePath === 'AGENTS.md')).toBe(true);
    const conflict = secondWrite.preservedManualFiles.find((c) => c.relativePath === 'AGENTS.md');
    expect(conflict?.diff).toContain('Regla Manual Agregada por el Usuario');

    // Verifica que el archivo en disco conserve la nota manual del usuario
    expect(fs.readFileSync(agentsFilePath, 'utf-8')).toContain('Regla Manual Agregada por el Usuario');

    // 11c. Guardián anti-secretos redacta cualquier texto que contenga una clave real
    const tsSecret = resolveSecret('TYPESAFE_API_KEY');
    if (tsSecret.value) {
      const scanResult = sanitizeAndAssertNoSecrets(`Texto con secreto filtrado: ${tsSecret.value}`);
      expect(scanResult.leakedKeys).toContain('TYPESAFE_API_KEY');
      expect(scanResult.sanitized).not.toContain(tsSecret.value);
      expect(scanResult.sanitized).toContain('[REDACTED_TYPESAFE_API_KEY]');
    }
  }, 45000);
});
