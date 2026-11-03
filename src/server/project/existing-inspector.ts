import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import type { ExistingProjectInspection } from '../../shared/types.js';

/**
 * Inspecciona un proyecto existente en disco para el modo "Agregar o mejorar una función".
 * Identifica arquitectura, convenciones, dependencias, pruebas relevantes y estado Git,
 * proponiendo el cambio mínimo compatible sin reemplazar el stack sin necesidad.
 */
export function inspectExistingProject(
  projectPath: string,
  featureRequestText: string
): ExistingProjectInspection {
  const resolved = path.resolve(projectPath);
  const inspectedAt = new Date().toISOString();

  if (!fs.existsSync(resolved)) {
    return {
      rootPath: resolved,
      exists: false,
      detectedStack: ['No encontrado en disco'],
      architectureSummary: `El directorio indicado (${resolved}) aún no existe en la PC.`,
      conventions: [],
      dependencies: {},
      devDependencies: {},
      testFrameworks: [],
      testScripts: {},
      keyFiles: [],
      minimalChangeProposal: {
        summary: 'Verificá la ruta del proyecto existente o cambiá al modo "Proyecto nuevo".',
        filesToTouch: [],
        filesToCreate: [],
        stackPreserved: true,
        compatibilityNotes: ['Ruta inexistente; no se modificaron archivos.'],
      },
      inspectedAt,
    };
  }

  const entries = fs.readdirSync(resolved, { withFileTypes: true });
  const keyFiles: string[] = [];
  const subdirs: string[] = [];

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
    if (entry.isFile()) {
      keyFiles.push(entry.name);
    } else if (entry.isDirectory()) {
      subdirs.push(entry.name);
      try {
        const subFiles = fs
          .readdirSync(path.join(resolved, entry.name))
          .slice(0, 8)
          .map((f) => `${entry.name}/${f}`);
        keyFiles.push(...subFiles);
      } catch {
        // ignore
      }
    }
  }

  const detectedStack: string[] = [];
  const conventions: string[] = [];
  let dependencies: Record<string, string> = {};
  let devDependencies: Record<string, string> = {};
  const testFrameworks: string[] = [];
  const testScripts: Record<string, string> = {};

  const pkgJsonPath = path.join(resolved, 'package.json');
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8')) as {
        type?: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        scripts?: Record<string, string>;
      };
      dependencies = pkg.dependencies || {};
      devDependencies = pkg.devDependencies || {};
      const allDeps = { ...dependencies, ...devDependencies };

      if (pkg.type === 'module') conventions.push('Módulos ES nativos ("type": "module" en package.json)');
      if (allDeps.typescript || fs.existsSync(path.join(resolved, 'tsconfig.json'))) {
        detectedStack.push('TypeScript');
      } else {
        detectedStack.push('JavaScript (Node.js)');
      }
      if (allDeps.react) detectedStack.push(`React (${allDeps.react})`);
      if (allDeps.vite) detectedStack.push(`Vite (${allDeps.vite})`);
      if (allDeps.next) detectedStack.push(`Next.js (${allDeps.next})`);
      if (allDeps.express) detectedStack.push(`Express (${allDeps.express})`);
      if (allDeps.tailwindcss) detectedStack.push('Tailwind CSS');

      if (allDeps.vitest) testFrameworks.push('Vitest');
      if (allDeps.jest) testFrameworks.push('Jest');
      if (allDeps.playwright || allDeps['@playwright/test']) testFrameworks.push('Playwright');

      for (const [k, v] of Object.entries(pkg.scripts || {})) {
        if (/test|check|lint|verify/i.test(k)) {
          testScripts[k] = v;
        }
      }
    } catch {
      // ignore malformed package.json
    }
  }

  // Si no tiene package.json pero tiene index.html y carpetas js/ y css/ (ej. AI Studio Pro)
  if (detectedStack.length === 0) {
    if (fs.existsSync(path.join(resolved, 'index.html'))) {
      detectedStack.push('HTML5 + CSS3 + Vanilla JavaScript (ES6+ sin bundler)');
      conventions.push('Carga modular en navegador sin transpilación ni dependencias npm');
    }
    if (fs.existsSync(path.join(resolved, 'pyproject.toml')) || fs.existsSync(path.join(resolved, 'requirements.txt'))) {
      detectedStack.push('Python');
    }
  }

  // Detectar convenciones de idioma y estilo en archivos JS/TS
  const sampleJsFile = keyFiles.find((f) => /\.(js|ts|tsx)$/.test(f));
  if (sampleJsFile) {
    try {
      const sampleText = fs.readFileSync(path.join(resolved, sampleJsFile), 'utf-8').slice(0, 3000);
      if (sampleText.includes("'use strict'")) {
        conventions.push("Directiva estricta `'use strict'` al inicio de los módulos");
      }
      if (/function\s+[a-z]+(ar|er|ir)[A-Z]|const\s+(config|datos|estilos|herramientas)/i.test(sampleText)) {
        conventions.push('Identificadores, funciones y comentarios en español');
      }
      if (sampleText.includes('addEventListener')) {
        conventions.push('Registro de eventos DOM desacoplado mediante addEventListener');
      }
    } catch {
      // ignore
    }
  }

  if (testFrameworks.length === 0) {
    testFrameworks.push('Sin test runner automatizado configurado actualmente (se recomienda agregar prueba focalizada)');
  }

  // Estado Git si es un repositorio
  let gitStatus: ExistingProjectInspection['gitStatus'] = { isRepo: false };
  if (fs.existsSync(path.join(resolved, '.git'))) {
    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: resolved, encoding: 'utf-8' }).trim();
      const headCommit = execSync('git rev-parse --short HEAD', { cwd: resolved, encoding: 'utf-8' }).trim();
      const statusOut = execSync('git status --porcelain', { cwd: resolved, encoding: 'utf-8' }).trim();
      let remoteUrl: string | undefined;
      try {
        remoteUrl = execSync('git config --get remote.origin.url', { cwd: resolved, encoding: 'utf-8' }).trim();
      } catch {
        // sin remoto
      }
      gitStatus = {
        isRepo: true,
        branch,
        headCommit,
        hasUncommittedChanges: statusOut.length > 0,
        remoteUrl,
      };
    } catch {
      gitStatus = { isRepo: true };
    }
  }

  // Proponer los archivos existentes específicos que conviene tocar según la estructura real
  const filesToTouch: string[] = [];
  for (const candidate of [
    'js/datos.js',
    'js/generacion.js',
    'js/ui.js',
    'js/principal.js',
    'server.ts',
    'App.tsx',
    'src/index.ts',
    'index.html',
  ]) {
    if (keyFiles.includes(candidate)) {
      filesToTouch.push(candidate);
    }
  }
  if (filesToTouch.length === 0 && keyFiles.length > 0) {
    filesToTouch.push(...keyFiles.slice(0, 3));
  }

  const architectureSummary =
    detectedStack.length > 0
      ? `Proyecto existente basado en ${detectedStack.join(' + ')} con directorios [${subdirs.join(', ') || 'raíz'}] y ${keyFiles.length} archivos clave identificados.`
      : `Directorio existente con ${keyFiles.length} archivos (${keyFiles.slice(0, 5).join(', ')}).`;

  return {
    rootPath: resolved,
    exists: true,
    detectedStack,
    architectureSummary,
    conventions:
      conventions.length > 0
        ? conventions
        : ['Mantener el estilo de módulos y nombres de archivos actuales del repositorio'],
    dependencies,
    devDependencies,
    testFrameworks,
    testScripts,
    keyFiles: keyFiles.slice(0, 30),
    gitStatus,
    minimalChangeProposal: {
      summary: `Integrar "${featureRequestText.slice(0, 90)}" como extensión incremental sobre ${detectedStack.join(' + ') || 'la estructura actual'}, reutilizando los módulos existentes (${filesToTouch.slice(0, 3).join(', ') || 'archivos principales'}) sin crear una aplicación paralela ni cambiar el stack.`,
      filesToTouch: filesToTouch.slice(0, 4),
      filesToCreate: ['docs/spec-cambio-incremental.md'],
      stackPreserved: true,
      compatibilityNotes: [
        `Se preserva íntegramente el stack detectado (${detectedStack.join(', ') || 'actual'}).`,
        'No se agregan frameworks ni bundlers ajenos a las convenciones del proyecto.',
        'Los cambios se acotan a los puntos de extensión existentes y su verificación.',
      ],
    },
    inspectedAt,
  };
}
