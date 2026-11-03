# Forja — Optimizador y Organizador de Proyectos de Programación

**Forja** es una aplicación personal que transforma una frase mínima, una especificación detallada con restricciones o una carpeta de proyecto existente en un **proyecto bien definido, investigado con fuentes comprobables, con stack justificado, documentación proporcional y entorno de agentes preparado y verificado**.

> **Resultado central:** *"Entendí qué quiero construir; sé qué conviene usar y por qué; tengo referencias, decisiones y tareas claras; y el entorno elegido está preparado o me muestra exactamente qué falta."*

---

## 1. Inicio Rápido

### Requisitos previos
- **Node.js** `>= 22.5` (verificado en `v24.22.2` con soporte nativo para `node:sqlite`).
- **Windows / macOS / Linux** (optimizado y verificado en Windows).

### Comandos principales
```bash
# 1. Instalar dependencias (si aún no están instaladas)
npm install

# 2. Iniciar el servidor de desarrollo + interfaz web en http://localhost:3847
npm run dev

# 3. Compilar el bundle de producción del cliente y verificar tipos TypeScript
npm run build
npm run typecheck

# 4. Ejecutar la suite completa de pruebas automatizadas (11 escenarios E2E)
npm test

# 5. Ejecutar el diagnóstico integral de conexiones, Jev, REA y flujo completo
npm run verify:all
```

---

## 2. Configuración Segura de Conexiones (Sin Versionar Secretos)

Forja **jamás** incluye claves ni tokens en archivos versionados, logs ni artefactos exportados. El módulo [`src/server/config/secrets.ts`](./src/server/config/secrets.ts) resuelve credenciales en este orden:
1. Almacén local ignorado por Git (`.data/secrets.json`, configurable desde la pestaña **Conexiones, Jev & REA** de la interfaz).
2. Variables de entorno del proceso o archivo `.env` local (ignorado por `.gitignore`).
3. Variables de entorno de ámbito `"User"` en el registro de Windows (`HKCU\Environment`).

| Variable | Propósito | Comportamiento si no está presente |
| :--- | :--- | :--- |
| `TYPESAFE_API_KEY` | Evaluaciones tipadas estructuradas en **Jev de TypeSafe** (`POST https://api.typesafe.ai/v1/systemone` y `GET https://api.typesafe.ai/v1/models`). | Muestra aviso claro de autenticación pendiente; **nunca** inventa puntajes simulados. |
| `REA` (`rea-agents@6.8.0`) | Análisis de aplicaciones y referencias con **Reverse Engineer Anything** (CLI, skill global y servidor MCP). | Verifica por separado CLI, skill (`v49`) y MCP activo. |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` | Modelo generativo separado de Jev para redacción y síntesis conversacional. | Utiliza el motor estructurado local + evaluaciones tipadas de Jev. |
| `GITHUB_TOKEN` | Mayor cuota en GitHub REST API y push de ramas remotas. | Usa la API pública de GitHub para lectura de commits/licencias y prepara ramas en Git local. |
| `X_BEARER_TOKEN` | Consultas directas a X API v2 (`/2/tweets/search/recent`). | Degrada limpiamente a cobertura pública indexada y marca la fuente directa de X como pendiente. |

---

## 3. Arquitectura y Separación de Decisiones de Stack

Cumpliendo el principio de **no convertir cada recomendación en una dependencia permanente del propio producto**, Forja documenta por separado:

### A. Stack del propio Optimizador (Forja)
- **Runtime y Backend:** Node.js `v24` + TypeScript (`tsx`) + servidor HTTP modular (`src/server/app.ts`).
- **Persistencia local:** `node:sqlite` (`DatabaseSync` nativo con WAL habilitado en `.data/forja.sqlite`), sin binarios C++ externos frágiles.
- **Frontend:** React 19 + Vite 6 + CSS semántico accesible con alto contraste y soporte completo de teclado (`src/client/App.tsx`).
- **Evaluación tipada:** SDK oficial `@typesafe-ai/sdk` (`v0.7.0`) consumiendo `jev-latest`.
- **Ingeniería inversa de referencias:** Integración con `rea-agents@6.8.0` (`analyze_javascript_application`, `rea doctor --json`).

### B. Stacks recomendados para los proyectos que el usuario prepara
Para cada proyecto que describas, Forja aplica primero una **compuerta de restricciones duras comprobables** (sistema operativo, presupuesto, privacidad, preservación de stack en proyectos existentes) y luego evalúa entre 2 y 3 alternativas válidas a través de las **7 dimensiones obligatorias**:
1. **Encaje funcional**
2. **Tiempo de construcción**
3. **Operación**
4. **Costo** (con supuestos y fuentes; *precio desconocido != gratis*)
5. **Experiencia (UX/UI y accesibilidad)**
6. **Integraciones**
7. **Evolución**

---

## 4. Recorrido Funcional Completo

1. **Entrada central (`"¿Qué querés construir o mejorar?"`):**
   - Soporta **Modo 1 (`Proyecto nuevo`)** y **Modo 2 (`Agregar o mejorar una función`)**.
   - En Modo 2 inspecciona la carpeta existente, detecta lenguajes, scripts, convenciones y pruebas, y propone el **cambio mínimo compatible** sin rehacer el proyecto ni cambiar su stack.
   - Separa **lo dicho explícitamente**, **lo inferido (supuestos visibles)** y **lo que falta decidir**, formulando como máximo **2 preguntas de alto impacto por turno** con opción recomendada y botón `"Avanzar con estos supuestos"`.
2. **Investigación profunda verificable (`src/server/research/research-engine.ts`):**
   - Niveles `fast`, `normal` y `deep` con presupuesto configurable de tiempo y consultas, persistencia de avance por paso, cancelación y reanudación, y reutilización de caché SQLite vigente.
   - Registra para cada repositorio de GitHub: **commit/versión revisada, licencia, fecha de último push, estado de mantenimiento, requisitos, límites conocidos** y nota explícita sobre estrellas.
3. **Integración funcional con Jev de TypeSafe (`src/server/providers/jev-service.ts`):**
   - Implementa los 6 usos concretos: claridad del brief (`brief_clarity`), selección de skills en 2 pasadas siguiendo el cookbook oficial (`skill_suggestion`), ajuste de MCP (`mcp_fit`), puntuación compuesta de dimensiones de stack (`stack_dimensions`), asignación de tareas a roles (`task_role_routing`) y detección de contradicciones/evidencia insuficiente (`evidence_contradiction_check`).
   - Incluye botón `"Probar conexión"` contra `/v1/models` y `/v1/systemone`.
4. **Fichas de referencia con REA (`src/server/providers/rea-adapter.ts`):**
   - Genera fichas estructuradas que separan **Observaciones**, **Inferencias** y **Reproducciones comprobadas**, incluyendo `evidenceId`, `SHA-256`, límites del análisis, patrones reutilizables, adaptaciones y aviso de licencias.
5. **Catálogo y Adaptadores por Cliente (`src/server/environment/client-adapters.ts`):**
   - Catálogo consultable y ampliable dividido en `Skills`, `MCP`, `Herramientas y CLI`, `Librerías y Plantillas` y `Referencias de Diseño`, distinguiendo dependencias de la futura app frente a herramientas de agentes.
   - Adaptadores para **Codex** (soporte completo e idempotente sobre `~/.codex/config.toml` y `~/.codex/skills`), **Claude Code**, **Cursor**, **OpenCode**, **Antigravity** y **Exportación Manual**, con seguimiento de las 5 etapas de alistamiento, backup `SHA-256` y reversión limpia (`Revertir cambios propios`).
6. **Paquete Documental Proporcional y Destinos (`src/server/project/ux-roles-docs-generator.ts`):**
   - Genera `docs/01-brief-y-alcance.md` a `docs/06-preparacion-entorno.md`, `AGENTS.md` y `project-forge.manifest.json` sincronizados con la revisión activa del brief.
   - Detecta ediciones manuales en disco mostrando un diff antes de sobrescribir, y prepara ramas Git verificando ausencia total de secretos y conflictos de commit base.
