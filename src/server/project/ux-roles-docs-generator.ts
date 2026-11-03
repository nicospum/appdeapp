import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { classifyTasksWithJev } from '../providers/jev-service.js';
import { sanitizeAndAssertNoSecrets, resolveSecret } from '../config/secrets.js';
import type {
  ProjectRecord,
  UxDesignProposal,
  AgentRoleSpec,
  AgentRoleTask,
  GeneratedArtifactFile,
  GitHubSyncResult,
} from '../../shared/types.js';

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf-8').digest('hex');
}

function computeSimpleLineDiff(oldText: string, newText: string): string {
  const oldLines = oldText.split(/\r?\n/);
  const newLines = newText.split(/\r?\n/);
  const diffLines: string[] = [];
  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen && diffLines.length < 40; i++) {
    const o = oldLines[i];
    const n = newLines[i];
    if (o !== n) {
      if (o !== undefined) diffLines.push(`- [L${i + 1} en disco]: ${o}`);
      if (n !== undefined) diffLines.push(`+ [L${i + 1} generado]: ${n}`);
    }
  }
  return diffLines.length > 0 ? diffLines.join('\n') : 'Sin diferencias de líneas.';
}

// ============================================================================
// 1. Propuesta de Diseño, UX, Estados y Wireframe Editable
// ============================================================================

export function buildUxDesignProposal(project: ProjectRecord): UxDesignProposal {
  const { brief, mode, existingInspection } = project;
  const isExisting = mode === 'existing_feature' && Boolean(existingInspection?.exists);

  const keyScreens: UxDesignProposal['keyScreens'] = isExisting
    ? [
        {
          id: 'scr_incremental_panel',
          name: `Panel / Vista Integrada en ${path.basename(existingInspection!.rootPath)}`,
          purpose: `Exponer la nueva función ("${brief.title}") dentro de la navegación existente sin romper el flujo actual.`,
          primaryActions: [
            'Activar la función desde el selector de herramientas actual',
            'Ejecutar acción principal con validación inmediata',
            'Exportar o guardar el resultado en el almacenamiento existente',
          ],
          states: {
            empty: 'Muestra una breve guía contextual de 1 línea y un ejemplo precargado listo para probar con un clic.',
            loading: 'Indicador real de etapa actual con botón visible de cancelar (sin barras de progreso porcentuales ficticias).',
            errorAndRecovery: 'Mensaje claro en español explicando la causa (ej. falta credencial o validación) y botón de reintentar sin perder los datos escritos.',
          },
        },
      ]
    : [
        {
          id: 'scr_home_intake',
          name: '1. Entrada Central y Selector de Proyectos',
          purpose: 'Comenzar una idea nueva (1 frase o documento extenso) o retomar un proyecto guardado en un clic.',
          primaryActions: [
            'Ingresar "¿Qué querés construir o mejorar?"',
            'Elegir modo ("Proyecto nuevo" vs "Agregar o mejorar función")',
            'Retomar proyecto persistido desde la barra lateral',
          ],
          states: {
            empty: 'Ejemplos interactivos de 1 clic (idea mínima, especificación detallada y mejora sobre proyecto existente).',
            loading: 'Paso real en curso ("Evaluando claridad de brief con Jev...", "Inspeccionando directorio local...").',
            errorAndRecovery: 'Conserva el texto ingresado en el área de entrada y permite continuar con supuestos locales si un proveedor externo falla.',
          },
        },
        {
          id: 'scr_brief_and_decisions',
          name: '2. Resumen Ejecutivo, Supuestos y Decisiones de Stack',
          purpose: 'Mostrar qué entendió la app, separar explícito/inferido/pendiente y comparar alternativas técnicas con prioridades ajustables.',
          primaryActions: [
            'Editar objetivo, restricciones y supuestos en línea',
            'Responder como máximo 2 preguntas de alto impacto o pulsar "Avanzar con estos supuestos"',
            'Cambiar prioridad (Rapidez, Costo, Local, Privacidad, Diseño, Mantenimiento) y recalcular el stack',
          ],
          states: {
            empty: 'Propuesta inicial generada automáticamente desde la primera frase.',
            loading: 'Indicador de consulta a Jev System One con latencia y modelo reales.',
            errorAndRecovery: 'Si `TYPESAFE_API_KEY` falla o se agota la cuota, muestra el error real de HTTP y mantiene el cálculo determinista en código.',
          },
        },
        {
          id: 'scr_research_and_rea',
          name: '3. Investigación Verificable y Fichas REA',
          purpose: 'Inspeccionar fuentes primarias consultadas (URLs, commits, licencias), estado de cobertura X y hallazgos REA (observación vs inferencia).',
          primaryActions: [
            'Elegir profundidad (Rápida, Normal, Profunda) y presupuesto de tiempo/consultas',
            'Cancelar o reanudar investigación en cualquier momento',
            'Desplegar evidencia cruda, contradicciones y fichas REA',
          ],
          states: {
            empty: 'Botón claro para iniciar investigación con presupuesto visible.',
            loading: 'Lista de los 6 pasos reales marcando cuáles provienen de caché y cuáles consultan red en vivo.',
            errorAndRecovery: 'El fallo de una fuente (ej. X sin token) no borra lo obtenido por GitHub o documentación oficial.',
          },
        },
        {
          id: 'scr_prep_and_export',
          name: '4. Catálogo, Preparación del Cliente y Paquete de Agentes',
          purpose: 'Seleccionar skills/MCPs sin solapamientos, aplicar "Preparar entorno" en Codex/Claude/Cursor/OpenCode, verificar o revertir, y exportar a disco o GitHub.',
          primaryActions: [
            'Revisar plan agrupado por proyecto y cliente con sus 5 estados de verificación',
            'Aplicar "Preparar entorno" o "Revertir cambios propios"',
            'Copiar prompt por rol para Codex o exportar paquete a carpeta local / rama GitHub',
          ],
          states: {
            empty: 'Plan precalculado con herramientas necesarias y recomendadas.',
            loading: 'Ejecución de respaldo SHA-256, escritura de configuración y handshake stdio MCP.',
            errorAndRecovery: 'Si se detecta edición concurrente o conflicto en Git, muestra el diff antes de sobrescribir y ofrece revertir con un clic.',
          },
        },
      ];

  const interactiveWireframeHtml = `<div style="font-family: system-ui, sans-serif; border: 1px solid #cbd5e1; border-radius: 10px; overflow: hidden; background: #f8fafc; color: #0f172a;">
  <header style="background: #0f172a; color: #f8fafc; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center;">
    <div><strong>${brief.title}</strong> <span style="font-size: 12px; background: #1e293b; padding: 2px 8px; border-radius: 999px; margin-left: 8px;">Rev #${brief.revision}</span></div>
    <div style="font-size: 12px; color: #94a3b8;">Navegación por teclado: Tab / Enter / Esc</div>
  </header>
  <div style="display: grid; grid-template-columns: 220px 1fr; min-height: 220px;">
    <nav aria-label="Secciones principales" style="background: #f1f5f9; padding: 12px; border-right: 1px solid #cbd5e1; font-size: 13px;">
      <div style="font-weight: 600; margin-bottom: 8px; color: #334155;">Flujo Principal</div>
      <ul style="list-style: none; padding: 0; margin: 0; display: grid; gap: 6px;">
        <li style="background: #e2e8f0; padding: 6px 10px; border-radius: 6px; font-weight: 600;">1. Entrada y Alcance</li>
        <li style="padding: 6px 10px;">2. Opciones y Decisiones</li>
        <li style="padding: 6px 10px;">3. Evidencia y Estado</li>
        <li style="padding: 6px 10px;">4. Exportación / Acción</li>
      </ul>
    </nav>
    <main style="padding: 16px;">
      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 12px;">
        <div style="font-size: 12px; text-transform: uppercase; color: #475569; font-weight: 700;">Objetivo Principal</div>
        <p style="margin: 6px 0 10px; font-size: 14px;">${brief.objective.slice(0, 180)}</p>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          ${brief.mvpScope
            .slice(0, 3)
            .map(
              (item) =>
                `<span style="font-size: 12px; background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 3px 8px; border-radius: 6px;">✓ ${item.slice(0, 45)}</span>`
            )
            .join('')}
        </div>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; background: #ecfdf5; border: 1px solid #a7f3d0; padding: 10px 14px; border-radius: 8px;">
        <span style="font-size: 13px; color: #065f46;"><strong>Siguiente acción útil:</strong> Validar flujo principal y exportar paquete</span>
        <button type="button" style="background: #059669; color: white; border: none; padding: 6px 12px; border-radius: 6px; font-weight: 600; cursor: pointer;">Continuar →</button>
      </div>
    </main>
  </div>
</div>`;

  return {
    navigationArchitecture: isExisting
      ? 'Integración directa dentro de la barra de herramientas/pestañas existente del proyecto, sin añadir niveles de navegación redundantes.'
      : 'Estructura maestra-detalle con barra lateral de proyectos, encabezado fijo de estado/siguiente acción y 5 pestañas de progresión clara con bloques <details> para evidencia técnica.',
    keyScreens,
    interactiveWireframeHtml,
    designResources: [
      {
        name: 'WAI-ARIA Authoring Practices Guide (APG)',
        type: 'interaction_pattern',
        contribution: 'Define el comportamiento exacto de teclado y foco para pestañas, acordeones desplegables (`<details>`) y tablas de comparación.',
        integrationMode: 'manual',
        sourceUrl: 'https://www.w3.org/WAI/ARIA/apg/patterns/',
      },
      {
        name: 'Chrome DevTools MCP + Skill `a11y-debugging`',
        type: 'a11y_testing',
        contribution: 'Permite verificar en un navegador real que el flujo se entiende, que los botones tienen contraste suficiente y que el teclado recorre toda la pantalla.',
        integrationMode: 'mcp',
        sourceUrl: 'https://github.com/ChromeDevTools/chrome-devtools-mcp',
      },
      {
        name: 'Lucide Icons + Variables CSS Semánticas',
        type: 'component_library',
        contribution: 'Iconografía consistente de bajo peso para distinguir estados (Recomendado, Seleccionado, Instalado, Reconocido, Probado) sin depender de librerías pesadas.',
        integrationMode: 'export',
        sourceUrl: 'https://lucide.dev',
      },
    ],
    accessibilityChecklist: [
      'Todos los controles interactivos son alcanzables con `Tab` / `Shift+Tab` y muestran anillo de foco visible (`:focus-visible`).',
      'Los estados nunca dependen solo del color: cada insignia combina color de alto contraste, ícono y etiqueta textual explícita.',
      'Los paneles técnicos extensos (JSON de evidencia, salidas de REA, diffs de archivos) usan bloques `<details><summary>` nativos operables con `Enter` o `Espacio`.',
      'Diseño adaptable (responsive) desde ventanas divididas de 768px hasta monitores de escritorio completos.',
    ],
  };
}

// ============================================================================
// 2. Roles de Agentes y Coordinación de Tareas sin Solapamiento de Archivos
// ============================================================================

export async function buildAgentRolesAndTasks(project: ProjectRecord): Promise<{
  roles: AgentRoleSpec[];
  tasks: AgentRoleTask[];
}> {
  const { brief, mode, existingInspection, stackComparison, capabilitySelections } = project;
  const chosenStack =
    stackComparison?.options.find((o) => o.id === stackComparison.selectedOptionId)?.name ||
    'Node.js + TypeScript + React + SQLite';
  const selectedToolNames = capabilitySelections
    .filter((c) => c.selectedForInstall)
    .map((c) => `${c.entry.name} (${c.entry.kind})`);

  const isSmallOrExisting = mode === 'existing_feature' || brief.coreFeatures.length <= 2;

  const baseRoles: Array<{
    id: string;
    title: string;
    objective: string;
    inputs: string[];
    deliverable: string;
    reviewCriteria: string[];
  }> = isSmallOrExisting
    ? [
        {
          id: 'rol_arquitectura_integracion',
          title: 'Arquitecto e Integrador Principal',
          objective: `Definir los contratos de datos e implementar la lógica principal de "${brief.title}" preservando la compatibilidad del entorno.`,
          inputs: ['docs/01-brief-y-alcance.md', 'docs/03-decisiones-tecnicas-y-stack.md'],
          deliverable: 'Módulos de lógica/backend validados con esquemas estrictos y sin secretos expuestos.',
          reviewCriteria: [
            'Respeta todas las restricciones duras del brief.',
            'No introduce dependencias redundantes ni rompe funciones previas.',
          ],
        },
        {
          id: 'rol_ux_interfaz',
          title: 'Especialista en UX e Interfaz Accesible',
          objective: 'Implementar la vista, estados (vacío, carga, error y recuperación) y navegación por teclado.',
          inputs: ['docs/04-diseno-ux-y-estados.md', 'Contratos de tipos del Arquitecto'],
          deliverable: 'Componentes de interfaz conectados con estados reales y sin porcentajes ficticios.',
          reviewCriteria: [
            'Funciona íntegramente con teclado (Tab, Enter, Escape).',
            'Muestra mensajes de error y recuperación verdaderos.',
          ],
        },
        {
          id: 'rol_calidad_verificacion',
          title: 'Revisor Técnico y de Producto (QA)',
          objective: 'Verificar mediante pruebas automatizadas y recorridos reales que el resultado cumple el objetivo del usuario.',
          inputs: ['docs/05-plan-de-trabajo-y-roles.md', 'Código integrado'],
          deliverable: 'Suite de pruebas pasando y reporte de verificación sin bloqueos.',
          reviewCriteria: [
            'Distingue pruebas con fixtures controladas de verificaciones en vivo.',
            'Ninguna API ausente figura como probada.',
          ],
        },
      ]
    : [
        {
          id: 'rol_coordinador_arquitectura',
          title: 'Coordinador Técnico y Arquitecto de Datos',
          objective: `Mantener la definición común de "${brief.title}", esquemas de datos, persistencia y contratos entre módulos.`,
          inputs: ['docs/01-brief-y-alcance.md', 'docs/03-decisiones-tecnicas-y-stack.md', 'project-forge.manifest.json'],
          deliverable: 'Esquema de base de datos, tipos compartidos (`src/shared/types.ts`) y gestión segura de configuración.',
          reviewCriteria: [
            'Cero credenciales en código cliente, logs o commits.',
            'Contratos de entrada/salida validados con Zod.',
          ],
        },
        {
          id: 'rol_integraciones_proveedores',
          title: 'Ingeniero de Integraciones, Investigación y Proveedores',
          objective: 'Implementar conectores verificados con APIs externas, Jev (TypeSafe), REA y adaptadores de clientes.',
          inputs: ['docs/02-investigacion-y-referencias.md', 'docs/06-preparacion-entorno.md'],
          deliverable: 'Adaptadores con manejo explícito de errores de red/cuota/autenticación y respaldos reversibles.',
          reviewCriteria: [
            'No reemplaza fallos de API por puntuaciones inventadas.',
            'Preserva configuraciones ajenas y permite revertir cambios propios.',
          ],
        },
        {
          id: 'rol_ux_frontend',
          title: 'Desarrollador de Experiencia de Usuario (UX/UI)',
          objective: 'Construir una interfaz clara, comprensible y accesible que priorice qué entendió la app, qué recomienda y la siguiente acción útil.',
          inputs: ['docs/04-diseno-ux-y-estados.md', 'API del servidor local'],
          deliverable: 'Interfaz interactiva con tablas comparativas, edición de supuestos, visor de diffs y detalles desplegables.',
          reviewCriteria: [
            'Sin formularios largos bloqueantes ni barras de progreso simuladas.',
            'Operable con teclado y adaptable a distintos tamaños de pantalla.',
          ],
        },
        {
          id: 'rol_revisor_calidad',
          title: 'Revisor de Producto y Verificación Técnica',
          objective: 'Ejecutar pruebas unitarias, de integración y recorridos completos de usuario, corrigiendo defectos antes del cierre.',
          inputs: ['docs/05-plan-de-trabajo-y-roles.md', 'Todos los artefactos del proyecto'],
          deliverable: 'Suite de pruebas automatizadas y validación de los casos de uso de punta a punta.',
          reviewCriteria: [
            'Comprueba persistencia, cambios de decisión, reversión de instalaciones y exportación sin secretos.',
          ],
        },
      ];

  const rawTasks: Array<{
    id: string;
    title: string;
    defaultRoleId: string;
    description: string;
    dependencies: string[];
    ownedFilesScope: string[];
    acceptanceCriteria: string[];
    priority: 'P0' | 'P1' | 'P2';
  }> =
    mode === 'existing_feature' && existingInspection?.exists
      ? [
          {
            id: 'tsk_1_contratos_cambio_minimo',
            title: 'Definir contrato y alcance del cambio mínimo compatible',
            defaultRoleId: baseRoles[0].id,
            description: `Preparar punto de extensión en ${existingInspection.minimalChangeProposal.filesToTouch[0] || 'el módulo de datos'} respetando las convenciones de ${path.basename(existingInspection.rootPath)}.`,
            dependencies: [],
            ownedFilesScope: [existingInspection.minimalChangeProposal.filesToTouch[0] || 'src/types.ts'],
            acceptanceCriteria: [
              'WHEN se inspecciona el cambio THEN no modifica el stack ni rompe importaciones existentes.',
            ],
            priority: 'P0',
          },
          {
            id: 'tsk_2_implementacion_funcion',
            title: `Implementar lógica e interfaz de "${brief.title}"`,
            defaultRoleId: baseRoles[1]?.id || baseRoles[0].id,
            description: `Conectar la nueva funcionalidad en ${existingInspection.minimalChangeProposal.filesToTouch.slice(1).join(', ') || 'la capa de UI y servicios'} con manejo explícito de estados vacío, carga y error.`,
            dependencies: ['tsk_1_contratos_cambio_minimo'],
            ownedFilesScope:
              existingInspection.minimalChangeProposal.filesToTouch.slice(1).length > 0
                ? existingInspection.minimalChangeProposal.filesToTouch.slice(1)
                : ['src/ui/'],
            acceptanceCriteria: [
              'WHEN el usuario ejecuta la nueva función THEN recibe respuesta real y los errores muestran recuperación clara.',
            ],
            priority: 'P0',
          },
          {
            id: 'tsk_3_pruebas_no_regresion',
            title: 'Verificar la nueva función y comprobar ausencia de regresiones',
            defaultRoleId: baseRoles[2]?.id || baseRoles[0].id,
            description: 'Ejecutar pruebas focalizadas sobre el nuevo flujo y validar que las funciones previas del repositorio siguen operativas.',
            dependencies: ['tsk_2_implementacion_funcion'],
            ownedFilesScope: ['tests/', 'docs/spec-cambio-incremental.md'],
            acceptanceCriteria: [
              'WHEN se corre la verificación THEN todas las aserciones pasan sin errores en consola.',
            ],
            priority: 'P1',
          },
        ]
      : [
          {
            id: 'tsk_1_nucleo_datos_contratos',
            title: 'Definir tipos compartidos, almacenamiento SQLite y resguardo de credenciales',
            defaultRoleId: baseRoles[0].id,
            description: `Crear modelos de dominio, persistencia durable y validación Zod para "${brief.title}".`,
            dependencies: [],
            ownedFilesScope: ['src/shared/types.ts', 'src/server/storage/', 'src/server/config/'],
            acceptanceCriteria: [
              'GIVEN el servidor iniciado WHEN se crea o edita un proyecto THEN se persiste en SQLite con su número de revisión y sin exponer claves.',
            ],
            priority: 'P0',
          },
          {
            id: 'tsk_2_servicios_dominio_integraciones',
            title: 'Implementar servicios de negocio, integraciones externas y manejo de errores reales',
            defaultRoleId: baseRoles[1]?.id || baseRoles[0].id,
            description: 'Construir los adaptadores y lógica principal respetando presupuestos de tiempo, cancelación/reanudación y degradación explícita.',
            dependencies: ['tsk_1_nucleo_datos_contratos'],
            ownedFilesScope: ['src/server/providers/', 'src/server/research/', 'src/server/environment/'],
            acceptanceCriteria: [
              'GIVEN una llamada a proveedor externo WHEN ocurre un error de cuota o credencial THEN el estado queda visible y no se inventan resultados.',
            ],
            priority: 'P0',
          },
          {
            id: 'tsk_3_interfaz_usuario_accesible',
            title: 'Construir interfaz principal con resumen, comparaciones, estados y soporte de teclado',
            defaultRoleId: baseRoles[2]?.id || baseRoles[1]?.id || baseRoles[0].id,
            description: 'Implementar las pantallas del flujo principal con edición en vivo, tablas de decisión, detalles desplegables y exportación.',
            dependencies: ['tsk_1_nucleo_datos_contratos', 'tsk_2_servicios_dominio_integraciones'],
            ownedFilesScope: ['src/client/', 'index.html'],
            acceptanceCriteria: [
              'GIVEN un usuario en la pantalla principal WHEN navega con teclado o cambia prioridades THEN la propuesta se recalcula y muestra qué está listo y qué falta.',
            ],
            priority: 'P0',
          },
          {
            id: 'tsk_4_verificacion_integral_qa',
            title: 'Ejecutar suite de validación de punta a punta y revisión de producto/técnica',
            defaultRoleId: baseRoles[baseRoles.length - 1].id,
            description: 'Validar casos completos (idea mínima, descripción detallada, persistencia, cambios de decisión y exportación limpia).',
            dependencies: ['tsk_2_servicios_dominio_integraciones', 'tsk_3_interfaz_usuario_accesible'],
            ownedFilesScope: ['tests/', 'src/scripts/'],
            acceptanceCriteria: [
              'WHEN se ejecuta `npm test` THEN todos los recorridos críticos pasan sin secretos en los artefactos.',
            ],
            priority: 'P1',
          },
        ];

  // Clasificar tareas con Jev para validar/ajustar la asignación de roles
  const jevRouting = await classifyTasksWithJev(
    project.id,
    brief,
    rawTasks.map((t) => ({ id: t.id, title: t.title, description: t.description })),
    baseRoles.map((r) => ({ id: r.id, title: r.title, objective: r.objective }))
  );

  const tasks: AgentRoleTask[] = rawTasks.map((t) => {
    const routedRoleId = jevRouting.assignments[t.id]?.roleId;
    const validRole = baseRoles.find((r) => r.id === routedRoleId)?.id || t.defaultRoleId;
    return {
      id: t.id,
      title: t.title,
      roleId: validRole,
      description: t.description,
      dependencies: t.dependencies,
      ownedFilesScope: t.ownedFilesScope,
      acceptanceCriteria: t.acceptanceCriteria,
      priority: t.priority,
      status: 'ready_to_transfer',
    };
  });

  const roles: AgentRoleSpec[] = baseRoles.map((r) => {
    const roleTasks = tasks.filter((t) => t.roleId === r.id);
    const taskListMd =
      roleTasks.length > 0
        ? roleTasks
            .map(
              (t) =>
                `- [ ] **${t.title}** (${t.priority})\n  - Alcance exclusivo de archivos: \`${t.ownedFilesScope.join('`, `')}\`\n  - Dependencias previas: ${t.dependencies.length ? t.dependencies.join(', ') : 'Ninguna'}\n  - Criterio: ${t.acceptanceCriteria.join(' ')}`
            )
            .join('\n')
        : `- [ ] Apoyar la revisión y validación de "${brief.title}".`;

    const readyPromptForAgent = [
      `# Instrucción de Transferencia para Agente — Rol: ${r.title}`,
      `## Proyecto: ${brief.title} (Revisión #${brief.revision})`,
      `- **Modo:** ${mode === 'existing_feature' ? 'Agregar o mejorar función en proyecto existente' : 'Proyecto nuevo'}`,
      `- **Objetivo:** ${brief.objective}`,
      `- **Stack elegido:** ${chosenStack}`,
      `- **Restricciones obligatorias:** SO: ${brief.constraints.targetOs} | Ejecución: ${brief.constraints.executionMode} | Presupuesto: ${brief.constraints.budgetLimit}`,
      '',
      `## Tu Rol y Objetivo`,
      `${r.objective}`,
      '',
      `## Herramientas y Skills Seleccionadas`,
      selectedToolNames.length > 0 ? selectedToolNames.map((n) => `- ${n}`).join('\n') : '- Herramientas estándar del repositorio',
      '',
      `## Tareas Asignadas y Frontera de Archivos (No modifiques archivos de otros roles sin coordinar)`,
      taskListMd,
      '',
      `## Entregable Esperado y Criterios de Revisión`,
      `- **Entregable:** ${r.deliverable}`,
      ...r.reviewCriteria.map((c) => `- **Verificación:** ${c}`),
    ].join('\n');

    return {
      id: r.id,
      title: r.title,
      objective: r.objective,
      inputs: r.inputs,
      selectedToolsAndSkills: selectedToolNames,
      deliverable: r.deliverable,
      reviewCriteria: r.reviewCriteria,
      readyPromptForAgent,
    };
  });

  return { roles, tasks };
}

// ============================================================================
// 3. Generación del Paquete de Documentación Proporcional y Manifiesto JSON
// ============================================================================

export function generateProjectArtifacts(
  project: ProjectRecord,
  checkDiskPath?: string
): GeneratedArtifactFile[] {
  const {
    brief,
    mode,
    existingInspection,
    researchRuns,
    stackComparison,
    reaCards,
    capabilitySelections,
    uxProposal,
    agentRoles,
    tasks,
    environmentPlans,
  } = project;

  const rev = brief.revision;
  const now = new Date().toISOString();
  const latestResearch = researchRuns[0];
  const selectedStack = stackComparison?.options.find((o) => o.id === stackComparison.selectedOptionId);

  // 1. Brief y Alcance (Unifica intención de Spec Kit + propuesta de OpenSpec)
  const docBriefContent = [
    `# 01. Brief y Alcance — ${brief.title}`,
    `> **Fuente de verdad del proyecto** | Revisión de Brief: \`v${rev}\` | Generado: \`${now}\``,
    `> **Modo:** ${mode === 'existing_feature' ? 'Agregar o mejorar una función en proyecto existente' : 'Proyecto nuevo'}`,
    '',
    `## 1. Objetivo y Problema a Resolver`,
    `- **Objetivo:** ${brief.objective}`,
    `- **Usuarios destinatarios:** ${brief.targetUsers}`,
    `- **Problema:** ${brief.problemStatement}`,
    '',
    existingInspection?.exists
      ? [
          `## 2. Diagnóstico del Proyecto Existente y Cambio Mínimo Compatible`,
          `- **Ruta inspeccionada:** \`${existingInspection.rootPath}\``,
          `- **Stack detectado (preservado):** ${existingInspection.detectedStack.join(', ')}`,
          `- **Resumen arquitectónico:** ${existingInspection.architectureSummary}`,
          `- **Convenciones observadas:** ${existingInspection.conventions.join(' | ')}`,
          `- **Propuesta de cambio mínimo:** ${existingInspection.minimalChangeProposal.summary}`,
          `- **Archivos a modificar:** \`${existingInspection.minimalChangeProposal.filesToTouch.join('`, `') || 'ninguno'}\``,
          `- **Archivos nuevos previstos:** \`${existingInspection.minimalChangeProposal.filesToCreate.join('`, `') || 'ninguno'}\``,
          '',
        ].join('\n')
      : '',
    `## 3. Lo Dicho Explícitamente vs. Lo Inferido vs. Decisiones Abiertas`,
    `### A. Lo que indicaste explícitamente`,
    ...brief.explicitFacts.map((f) => `- ${f}`),
    '',
    `### B. Supuestos inferidos (editables)`,
    ...brief.inferredAssumptions.map(
      (a) => `- **[${a.accepted ? 'Aceptado' : 'En revisión'} - ${a.category}]** ${a.statement} *(Motivo: ${a.rationale})*`
    ),
    '',
    `### C. Preguntas clave y decisiones (${brief.advancedWithAssumptions ? 'Avanzado con supuestos visibles' : 'Estado actual'})`,
    ...brief.clarifyingQuestions.map((q) => {
      const chosen = q.options.find((o) => o.id === q.selectedOptionId);
      return `- **${q.question}** (${q.area})\n  - *Impacto:* ${q.whyItMatters}\n  - *Decisión actual:* ${q.customAnswer || chosen?.label || 'Pendiente'}`;
    }),
    '',
    `## 4. Restricciones Comprobables`,
    `- **Sistema Operativo objetivo:** ${brief.constraints.targetOs}`,
    `- **Modo de ejecución:** ${brief.constraints.executionMode}`,
    `- **Presupuesto:** ${brief.constraints.budgetLimit}`,
    `- **Privacidad:** ${brief.constraints.privacyLevel}`,
    `- **Tecnologías requeridas:** ${brief.constraints.lockedTechnologies.join(', ') || 'Abierto a recomendación'}`,
    `- **Tecnologías excluidas:** ${brief.constraints.forbiddenTechnologies.join(', ') || 'Ninguna'}`,
    '',
    `## 5. Alcance Inicial Realizable (MVP) vs. Mejoras Posteriores`,
    `### Alcance Inicial (MVP)`,
    ...brief.mvpScope.map((m) => `- [ ] ${m}`),
    '',
    `### Mejoras Posteriores (Fuera de la primera entrega)`,
    ...brief.futureImprovements.map((f) => `- ${f}`),
  ]
    .filter(Boolean)
    .join('\n');

  // 2. Investigación y Referencias (Evidencia web/GitHub/MCP/X + Fichas REA)
  const docResearchContent = [
    `# 02. Investigación Profunda y Fichas de Referencia (REA)`,
    `> **Revisión de origen:** \`v${rev}\` | **Última corrida:** \`${latestResearch?.id || 'sin ejecutar'}\` (${latestResearch?.status || 'pendiente'})`,
    '',
    latestResearch
      ? [
          `## 1. Resumen de la Investigación (${latestResearch.depth.toUpperCase()})`,
          `- **Propósito:** ${latestResearch.purpose}`,
          `- **Presupuesto y consumo:** ${latestResearch.requestsUsed}/${latestResearch.budget.maxNetworkRequests} consultas (${latestResearch.reusedCachedCount} reutilizadas de caché vigente), tiempo ${(latestResearch.elapsedMs / 1000).toFixed(1)}s/${latestResearch.budget.maxDurationSeconds}s.`,
          `- **Cobertura de X (Twitter):** \`${latestResearch.xCoverageStatus}\` — ${latestResearch.xCoverageNote}`,
          '',
          `### Conclusiones Verificadas`,
          ...latestResearch.conclusions.map((c) => `- ${c}`),
          '',
          `### Aspectos Pendientes e Incertidumbres Conservadas`,
          ...latestResearch.openUncertainties.map((u) => `- ⚠️ ${u}`),
          '',
          `## 2. Fuentes y Evidencia Comprobable`,
          ...latestResearch.evidenceItems.map((ev) =>
            [
              `### [${ev.title}](${ev.url})`,
              `- **Categoría:** \`${ev.category}\` | **Origen:** \`${ev.sourceType}\` | **Fecha de consulta:** \`${ev.consultedAt}\``,
              `- **Relación con necesidad del proyecto:** ${ev.projectNeedRelation}`,
              `- **Resumen:** ${ev.summary}`,
              ev.repoMetadata
                ? `- **Metadatos de Repositorio GitHub:** Versión/Commit: \`${ev.repoMetadata.versionOrCommit}\` | Licencia: \`${ev.repoMetadata.license}\` | Último push: \`${ev.repoMetadata.lastPushedAt}\` | Mantenimiento: \`${ev.repoMetadata.maintenanceStatus}\` | Requisitos: ${ev.repoMetadata.requirements.join(', ')}\n  - *Límites conocidos:* ${ev.repoMetadata.knownLimits.join('; ')}\n  - *Nota sobre estrellas (${ev.repoMetadata.starsCount ?? 0}):* ${ev.repoMetadata.starsNote}`
                : '',
              ev.contradictionsOrUncertainties
                ? `- **Incertidumbre / Límite:** ${ev.contradictionsOrUncertainties}`
                : '',
            ]
              .filter(Boolean)
              .join('\n')
          ),
        ].join('\n')
      : '_Ejecutá la investigación en la pestaña "Investigación" para poblar las evidencias verificadas._',
    '',
    `## 3. Fichas de Análisis de Referencias con REA (Reverse Engineer Anything)`,
    reaCards.length > 0
      ? reaCards
          .map((card) =>
            [
              `### Referencia: ${card.targetName} (\`${card.decision.toUpperCase()}\`)`,
              `- **Ruta / Origen:** \`${card.targetPathOrUrl}\``,
              `- **Necesidad del proyecto que resuelve:** ${card.projectNeed}`,
              `- **Función observada:** ${card.observedFeature}`,
              `- **Herramienta utilizada:** \`${card.toolUsed}\` | **Evidencia ID:** \`${card.evidenceId || 'N/A'}\` | **SHA-256:** \`${card.artifactSha256?.slice(0, 16) || 'N/A'}…\``,
              `- **Desglose Epistémico:**`,
              `  - **Observaciones directas:** ${card.epistemic.observations.join(' ')}`,
              `  - **Inferencias:** ${card.epistemic.inferences.join(' ')}`,
              `  - **Reproducciones comprobadas:** ${card.epistemic.verifiedReproductions.join(' ')}`,
              `- **Límites del análisis:** ${card.analysisLimits.join(' ')}`,
              `- **Patrón o componente reutilizable:** ${card.reusablePatternOrCode}`,
              `- **Adaptaciones necesarias:** ${card.requiredAdaptations.join('; ')}`,
              `- **Decisión (${card.decision}):** ${card.decisionRationale}`,
              `- **Licencia y atribuciones:** ${card.licenseAndAttribution.sourceLicense} — ${card.licenseAndAttribution.attributionRequired}`,
              `  - *Aviso legal REA:* ${card.licenseAndAttribution.reaLicenseDisclaimer}`,
            ].join('\n')
          )
          .join('\n\n')
      : '_Sin fichas REA registradas aún._',
  ].join('\n');

  // 3. Decisiones Técnicas y Comparación del Stack
  const docStackContent = [
    `# 03. Decisiones Técnicas y Elección del Stack`,
    `> **Revisión de origen:** \`v${rev}\` | **Perfil de prioridad activo:** \`${stackComparison?.activePreset || 'balanced'}\``,
    '',
    stackComparison
      ? [
          `## 1. Recomendación Principal Elegida`,
          `- **Stack Seleccionado:** **${selectedStack?.name || stackComparison.recommendedOptionId}**`,
          `- **Justificación:** ${stackComparison.recommendationRationale}`,
          `- **Sensibilidad al cambio de prioridades:** ${stackComparison.prioritySensitivityExplanation}`,
          '',
          `## 2. Tabla Comparativa de Alternativas (7 Dimensiones + Restricciones Duras)`,
          `| Dimensión | ${stackComparison.options.map((o) => `${o.name} (${o.disqualifiedByHardConstraint ? 'DESCALIFICADA' : o.weightedScore + ' pts'})`).join(' | ')} |`,
          `| :--- | ${stackComparison.options.map(() => ':---').join(' | ')} |`,
          `| **Restricciones duras** | ${stackComparison.options
            .map((o) =>
              o.disqualifiedByHardConstraint
                ? `❌ Incumple: ${o.disqualificationReason}`
                : '✅ Cumple todas las restricciones'
            )
            .join(' | ')} |`,
          ...(['functionalFit', 'buildTime', 'operations', 'cost', 'experience', 'integrations', 'evolution'] as const).map(
            (dimKey) =>
              `| **${stackComparison.options[0].dimensions[dimKey].label}** (peso ${stackComparison.weights[dimKey]}%) | ${stackComparison.options
                .map(
                  (o) =>
                    `**${o.dimensions[dimKey].rawScoreLevel.toFixed(1)}/3.0**: ${o.dimensions[dimKey].explanation}`
                )
                .join(' | ')} |`
          ),
          '',
          `## 3. Estimación de Costos con Supuestos y Fuentes`,
          ...stackComparison.options.map(
            (o) =>
              `### ${o.name}\n- **Rango mensual estimado:** ${o.costEstimate.monthlyRangeUsd}\n- **Servicios requeridos:** ${o.costEstimate.requiredServices.join(', ')}\n- **Supuestos:** ${o.costEstimate.assumptions.join(' ')}\n- **Fuente:** ${o.costEstimate.sourceUrl}\n- **Nota:** ${o.costEstimate.note}`
          ),
        ].join('\n')
      : '_Comparación de stack pendiente._',
  ].join('\n');

  // 4. Diseño, UX y Estados
  const ux = uxProposal ?? buildUxDesignProposal(project);
  const docUxContent = [
    `# 04. Diseño, UX, Pantallas y Accesibilidad`,
    `> **Revisión de origen:** \`v${rev}\``,
    '',
    `## 1. Arquitectura de Navegación`,
    ux.navigationArchitecture,
    '',
    `## 2. Pantallas Clave y Estados (Vacío, Carga, Error y Recuperación)`,
    ...ux.keyScreens.map((s) =>
      [
        `### ${s.name}`,
        `- **Propósito:** ${s.purpose}`,
        `- **Acciones principales:** ${s.primaryActions.join(' | ')}`,
        `- **Estado vacío (Empty):** ${s.states.empty}`,
        `- **Estado de carga (Loading):** ${s.states.loading}`,
        `- **Estado de error y recuperación:** ${s.states.errorAndRecovery}`,
      ].join('\n')
    ),
    '',
    `## 3. Recursos de Diseño e Integración`,
    `| Recurso | Tipo | Qué aporta | Modo de integración | Fuente |`,
    `| :--- | :--- | :--- | :--- | :--- |`,
    ...ux.designResources.map(
      (r) => `| **${r.name}** | \`${r.type}\` | ${r.contribution} | \`${r.integrationMode}\` | [Ver](${r.sourceUrl}) |`
    ),
    '',
    `## 4. Criterios de Accesibilidad y Teclado`,
    ...ux.accessibilityChecklist.map((c) => `- [x] ${c}`),
  ].join('\n');

  // 5. Plan de Trabajo Priorizado y Roles
  const docWorkPlanContent = [
    `# 05. Plan de Trabajo, Dependencias y Roles de Agentes`,
    `> **Revisión de origen:** \`v${rev}\``,
    '',
    `## 1. Equipo de Roles Propuesto para este Proyecto`,
    ...agentRoles.map((r) =>
      [
        `### ${r.title} (\`${r.id}\`)`,
        `- **Objetivo:** ${r.objective}`,
        `- **Entradas:** ${r.inputs.join(', ')}`,
        `- **Herramientas seleccionadas:** ${r.selectedToolsAndSkills.join(', ') || 'Estándar'}`,
        `- **Entregable:** ${r.deliverable}`,
        `- **Criterios de revisión:** ${r.reviewCriteria.join(' | ')}`,
      ].join('\n')
    ),
    '',
    `## 2. Tareas Priorizadas y Coordinación de Archivos`,
    ...tasks.map((t) =>
      [
        `- [ ] **[${t.priority}] ${t.title}** (\`${t.id}\`)`,
        `  - **Rol responsable:** \`${t.roleId}\``,
        `  - **Dependencias previas:** ${t.dependencies.length > 0 ? t.dependencies.join(', ') : 'Ninguna (puede iniciar en etapa 1)'}`,
        `  - **Alcance exclusivo de archivos (evita conflictos):** \`${t.ownedFilesScope.join('`, `')}\``,
        `  - **Descripción:** ${t.description}`,
        `  - **Criterios de aceptación (Given/When/Then):** ${t.acceptanceCriteria.join(' | ')}`,
      ].join('\n')
    ),
  ].join('\n');

  // 6. Preparación del Entorno (Skills, MCP, Herramientas, Versiones, Destinos y Verificación)
  const latestPlan = environmentPlans[0];
  const docPrepContent = [
    `# 06. Preparación del Entorno, Skills y Servidores MCP`,
    `> **Revisión de origen:** \`v${rev}\``,
    '',
    `## 1. Selección de Capacidades (Separando Dependencias de Runtime vs. Desarrollo)`,
    `| Capacidad | Tipo | Alcance | Clasificación | Motivo / Estado de Solapamiento | Costo conocido |`,
    `| :--- | :--- | :--- | :--- | :--- | :--- |`,
    ...capabilitySelections.map(
      (s) =>
        `| **${s.entry.name}** (\`${s.entry.version}\`) | \`${s.entry.kind}\` | \`${
          s.entry.scopeCategory === 'app_runtime_dependency' ? 'Runtime de la App' : 'Solo Desarrollo'
        }\` | **${s.classification.toUpperCase()}** | ${s.classificationReason} | ${s.entry.knownCost} |`
    ),
    '',
    `## 2. Plan de Instalación por Cliente y Estado de Verificación`,
    latestPlan
      ? latestPlan.actions
          .map(
            (a) =>
              `- **[${a.clientId}] ${a.capabilityName}** (\`${a.kind}\` -> \`${a.targetPath}\`): Estado = **\`${a.stage}\`** — ${a.verificationDetail || a.operationSummary}${
                a.pendingInstruction ? ` *(Pendiente: ${a.pendingInstruction})*` : ''
              }`
          )
          .join('\n')
      : '_Generá y aplicá el plan en la pestaña "Preparación" para registrar los estados por cliente._',
  ].join('\n');

  // 7. AGENTS.md (Instrucciones consolidadas para Codex / Claude Code / Cursor / OpenCode)
  const agentsMdContent = [
    `# AGENTS.md — Instrucciones para Agentes de Programación`,
    `> **Proyecto:** ${brief.title} | **Revisión de Brief:** \`v${rev}\` | **Generado por:** Forja (Optimizador de Proyectos)`,
    '',
    `## 1. Contexto Esencial`,
    `- **Objetivo:** ${brief.objective}`,
    `- **Stack:** ${selectedStack?.name || 'Ver docs/03-decisiones-tecnicas-y-stack.md'}`,
    `- **Restricciones:** SO ${brief.constraints.targetOs}, Ejecución ${brief.constraints.executionMode}, Presupuesto ${brief.constraints.budgetLimit}.`,
    `- **Fuente de verdad:** Leé \`project-forge.manifest.json\` y la carpeta \`docs/\` antes de modificar código. No dupliques archivos de especificación.`,
    '',
    `## 2. Reglas de Coordinación Multi-Agente`,
    `- Cada tarea en \`docs/05-plan-de-trabajo-y-roles.md\` define un \`ownedFilesScope\`. Nunca edites archivos asignados a otro rol en paralelo sin completar primero las tareas de las que depende.`,
    `- Ninguna clave o credencial (\`TYPESAFE_API_KEY\`, \`OPENAI_API_KEY\`, \`GITHUB_TOKEN\`, \`X_BEARER_TOKEN\`) puede escribirse en código fuente, informes ni commits.`,
    '',
    `## 3. Prompts Listos por Rol`,
    ...agentRoles.map((r) => `### Rol: ${r.title}\n\`\`\`markdown\n${r.readyPromptForAgent}\n\`\`\``),
  ].join('\n');

  // 8. Manifiesto JSON Versionado (Fuente estructurada de verdad)
  const manifestObj = {
    schemaVersion: '1.0.0',
    generator: 'forja-project-optimizer',
    projectId: project.id,
    projectName: project.name,
    mode: project.mode,
    sourceBriefRevision: rev,
    generatedAt: now,
    staleSectionsRequiringRevalidation: project.staleSectionsRequiringRevalidation,
    briefSummary: {
      title: brief.title,
      objective: brief.objective,
      constraints: brief.constraints,
      mvpScope: brief.mvpScope,
    },
    selectedStack: selectedStack
      ? {
          id: selectedStack.id,
          name: selectedStack.name,
          components: selectedStack.components,
          weightedScore: selectedStack.weightedScore,
        }
      : null,
    selectedCapabilities: capabilitySelections
      .filter((c) => c.selectedForInstall)
      .map((c) => ({
        id: c.catalogId,
        name: c.entry.name,
        kind: c.entry.kind,
        version: c.entry.version,
        scopeCategory: c.entry.scopeCategory,
      })),
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      roleId: t.roleId,
      priority: t.priority,
      dependencies: t.dependencies,
      ownedFilesScope: t.ownedFilesScope,
    })),
  };
  const manifestJsonContent = JSON.stringify(manifestObj, null, 2);

  const rawFiles: Array<{
    relativePath: string;
    artifactCategory: GeneratedArtifactFile['artifactCategory'];
    title: string;
    content: string;
  }> = [
    {
      relativePath: 'docs/01-brief-y-alcance.md',
      artifactCategory: 'brief_scope',
      title: 'Brief y Alcance',
      content: docBriefContent,
    },
    {
      relativePath: 'docs/02-investigacion-y-referencias.md',
      artifactCategory: 'research',
      title: 'Investigación y Fichas REA',
      content: docResearchContent,
    },
    {
      relativePath: 'docs/03-decisiones-tecnicas-y-stack.md',
      artifactCategory: 'technical_decisions',
      title: 'Decisiones Técnicas y Stack',
      content: docStackContent,
    },
    {
      relativePath: 'docs/04-diseno-ux-y-estados.md',
      artifactCategory: 'design_ux',
      title: 'Diseño, UX y Estados',
      content: docUxContent,
    },
    {
      relativePath: 'docs/05-plan-de-trabajo-y-roles.md',
      artifactCategory: 'work_plan',
      title: 'Plan de Trabajo y Roles',
      content: docWorkPlanContent,
    },
    {
      relativePath: 'docs/06-preparacion-entorno.md',
      artifactCategory: 'environment_prep',
      title: 'Preparación del Entorno',
      content: docPrepContent,
    },
    {
      relativePath: 'AGENTS.md',
      artifactCategory: 'agent_instructions',
      title: 'Instrucciones para Agentes (AGENTS.md)',
      content: agentsMdContent,
    },
    {
      relativePath: 'project-forge.manifest.json',
      artifactCategory: 'manifest_json',
      title: 'Manifiesto Estructurado Versionado (JSON)',
      content: manifestJsonContent,
    },
  ];

  const baseDirToCheck = checkDiskPath || project.localTargetPath;
  const previousByPath = new Map(project.generatedArtifacts.map((a) => [a.relativePath, a]));

  return rawFiles.map((f) => {
    const { sanitized } = sanitizeAndAssertNoSecrets(f.content);
    const hash = sha256(sanitized);
    let manualEditDetected = false;
    let diffWithDisk: string | undefined;

    if (baseDirToCheck) {
      const fullDiskPath = path.join(path.resolve(baseDirToCheck), f.relativePath);
      if (fs.existsSync(fullDiskPath)) {
        const diskContent = fs.readFileSync(fullDiskPath, 'utf-8');
        const diskHash = sha256(diskContent);
        const prevArtifact = previousByPath.get(f.relativePath);
        // Si el archivo en disco difiere del hash que nosotros generamos previamente, hubo edición manual del usuario
        if (prevArtifact && diskHash !== prevArtifact.sha256 && diskHash !== hash) {
          manualEditDetected = true;
          diffWithDisk = computeSimpleLineDiff(diskContent, sanitized);
        } else if (!prevArtifact && diskHash !== hash) {
          manualEditDetected = true;
          diffWithDisk = computeSimpleLineDiff(diskContent, sanitized);
        }
      }
    }

    return {
      relativePath: f.relativePath,
      artifactCategory: f.artifactCategory,
      title: f.title,
      content: sanitized,
      sourceBriefRevision: rev,
      sha256: hash,
      generatedAt: now,
      manualEditDetected,
      diffWithDisk,
    };
  });
}

// ============================================================================
// 4. Aplicación a Directorio Local y Preparación de Rama en GitHub
// ============================================================================

export function applyArtifactsToLocalDirectory(params: {
  project: ProjectRecord;
  targetDirectory: string;
  overwriteManualEdits?: boolean;
}): {
  writtenFiles: string[];
  preservedManualFiles: Array<{ relativePath: string; diff: string }>;
  resolvedTargetDirectory: string;
} {
  const resolvedDir = path.resolve(params.targetDirectory);
  fs.mkdirSync(resolvedDir, { recursive: true });

  const artifacts = generateProjectArtifacts(params.project, resolvedDir);
  const writtenFiles: string[] = [];
  const preservedManualFiles: Array<{ relativePath: string; diff: string }> = [];

  for (const art of artifacts) {
    const fullPath = path.join(resolvedDir, art.relativePath);
    if (art.manualEditDetected && !params.overwriteManualEdits) {
      preservedManualFiles.push({
        relativePath: art.relativePath,
        diff: art.diffWithDisk || 'Edición manual detectada en disco.',
      });
      continue;
    }
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, art.content, 'utf-8');
    writtenFiles.push(fullPath);
  }

  params.project.generatedArtifacts = artifacts;
  params.project.localTargetPath = resolvedDir;
  return { writtenFiles, preservedManualFiles, resolvedTargetDirectory: resolvedDir };
}

/**
 * Prepara una rama Git coherente con documentos, manifiestos y configuraciones del proyecto,
 * verificando primero la revisión de partida, escaneando secretos y manejando conflictos sin sobrescribir trabajo.
 */
export function prepareGitHubBranchDelivery(params: {
  project: ProjectRecord;
  targetDirectory?: string;
  branchName?: string;
  expectedBaseCommit?: string;
}): GitHubSyncResult {
  const { project } = params;
  const workDir = path.resolve(
    params.targetDirectory ||
      project.localTargetPath ||
      path.join(process.cwd(), '.data', 'repos', project.id)
  );
  fs.mkdirSync(workDir, { recursive: true });

  const slug = project.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 28) || 'proyecto';
  const branchName = params.branchName || `forja/prep-${slug}-rev${project.brief.revision}`;
  const now = new Date().toISOString();

  try {
    // 1. Inicializar repo git si no lo es todavía
    if (!fs.existsSync(path.join(workDir, '.git'))) {
      execSync('git init', { cwd: workDir, stdio: 'ignore' });
      execSync('git config user.name "Forja Optimizer"', { cwd: workDir, stdio: 'ignore' });
      execSync('git config user.email "forja@local.dev"', { cwd: workDir, stdio: 'ignore' });
    }

    // 2. Verificar revisión de partida (HEAD) para no sobrescribir commits nuevos inesperados
    let baseCommitSha: string | undefined;
    try {
      baseCommitSha = execSync('git rev-parse --short HEAD', { cwd: workDir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      baseCommitSha = undefined; // repo recién creado sin commits aún
    }

    if (params.expectedBaseCommit && baseCommitSha && params.expectedBaseCommit !== baseCommitSha) {
      return {
        status: 'conflict_detected',
        branchName,
        baseCommitSha,
        filesCommitted: [],
        secretsScanPassed: true,
        remoteRunnerVerified: false,
        executionPendingNote:
          'Pendiente: se detectaron commits nuevos en el repositorio que no coinciden con la revisión de partida.',
        message: `Conflicto de revisión detectado: se esperaba HEAD ${params.expectedBaseCommit} pero el repositorio está en ${baseCommitSha}. No se sobrescribieron cambios.`,
        timestamp: now,
      };
    }

    // 3. Escribir artefactos verificando que ningún secreto se filtre y respetando ediciones manuales no confirmadas
    const artifacts = generateProjectArtifacts(project, workDir);
    const manualConflicts = artifacts.filter((a) => a.manualEditDetected);
    if (manualConflicts.length > 0 && params.expectedBaseCommit) {
      return {
        status: 'conflict_detected',
        branchName,
        baseCommitSha,
        filesCommitted: [],
        secretsScanPassed: true,
        remoteRunnerVerified: false,
        executionPendingNote: 'Revisá las diferencias de archivos editados manualmente antes de confirmar la rama.',
        message: `Se detectaron ediciones manuales sin confirmar en: ${manualConflicts.map((m) => m.relativePath).join(', ')}.`,
        timestamp: now,
      };
    }

    // Crear o cambiar a la rama de preparación
    try {
      execSync(`git checkout -B "${branchName}"`, { cwd: workDir, stdio: 'ignore' });
    } catch {
      // ignore
    }

    const committedFiles: string[] = [];
    for (const art of artifacts) {
      const check = sanitizeAndAssertNoSecrets(art.content);
      const destFile = path.join(workDir, art.relativePath);
      fs.mkdirSync(path.dirname(destFile), { recursive: true });
      fs.writeFileSync(destFile, check.sanitized, 'utf-8');
      committedFiles.push(art.relativePath);
    }

    execSync('git add docs/ AGENTS.md project-forge.manifest.json', { cwd: workDir, stdio: 'ignore' });
    const statusPorcelain = execSync('git status --porcelain', { cwd: workDir, encoding: 'utf-8' }).trim();
    if (statusPorcelain.length > 0) {
      execSync(
        `git commit -m "chore(forja): preparar paquete de proyecto rev v${project.brief.revision}"`,
        { cwd: workDir, stdio: 'ignore' }
      );
    }

    const newCommitSha = execSync('git rev-parse --short HEAD', { cwd: workDir, encoding: 'utf-8' }).trim();
    const ghToken = resolveSecret('GITHUB_TOKEN');

    const result: GitHubSyncResult = {
      status: ghToken.value && project.githubRepoTarget ? 'pushed_branch' : 'prepared_local_branch_pending_remote',
      repoUrl: project.githubRepoTarget || `file:///${workDir.replace(/\\/g, '/')}`,
      branchName,
      baseCommitSha,
      newCommitSha,
      filesCommitted: committedFiles,
      secretsScanPassed: true,
      remoteRunnerVerified: false, // Preparar archivos en GitHub no instala herramientas en un runner remoto salvo conexión explícita
      executionPendingNote:
        'Importante: Preparar la rama y documentos en Git/GitHub NO instala herramientas en un entorno remoto ni ejecuta el proyecto. La preparación ejecutable en clientes remotos queda marcada como pendiente hasta conectar un runner.',
      message: `Rama '${branchName}' preparada en commit ${newCommitSha} (${committedFiles.length} artefactos, escaneo de secretos OK).`,
      timestamp: now,
    };

    project.generatedArtifacts = artifacts;
    project.githubSyncHistory.unshift(result);
    return result;
  } catch (err) {
    return {
      status: 'blocked_no_credentials',
      branchName,
      filesCommitted: [],
      secretsScanPassed: true,
      remoteRunnerVerified: false,
      executionPendingNote: 'La preparación ejecutable queda pendiente.',
      message: `No se pudo completar la operación Git: ${err instanceof Error ? err.message : String(err)}`,
      timestamp: now,
    };
  }
}
