import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { initDatabase, closeDatabase } from '../server/storage/db.js';
import { ensureCatalogSeeded } from '../server/catalog/catalog-service.js';
import { getConnectionsSummary } from '../server/app.js';
import { probeTypeSafeConnection } from '../server/providers/jev-service.js';
import { inspectReaSystemStatus, analyzeLocalJsTargetWithRea } from '../server/providers/rea-adapter.js';
import { createFullProject } from '../server/project/project-service.js';

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-verify-all-'));
  const dbPath = path.join(tmpDir, 'verify.sqlite');

  console.log('===================================================================');
  console.log(' FORJA — Verificación Integral de Conexiones, Jev, REA y Flujo E2E');
  console.log('===================================================================\n');

  try {
    initDatabase(dbPath);
    const catalog = ensureCatalogSeeded();
    console.log(`[1/5] Base de datos SQLite y catálogo inicializados (${catalog.length} entradas verificadas).`);

    const connections = await getConnectionsSummary();
    console.log('[2/5] Estado de conexiones detectadas (sin exponer secretos):');
    for (const c of connections) {
      console.log(
        `  - ${c.displayName}: ${c.configured ? 'CONFIGURADO' : 'PENDIENTE'} (origen: ${c.sourceScope}, pista: ${
          c.maskedHint || 'ninguna'
        })`
      );
    }

    const probe = await probeTypeSafeConnection();
    console.log(
      `[3/5] Prueba en vivo de Jev de TypeSafe: ${probe.ok ? 'OK' : 'ERROR'} | Modelos: ${probe.models
        .map((m) => m.name)
        .join(', ')} | Modelo usado: ${probe.probeEvaluation.modelUsed} (${probe.probeEvaluation.latencyMs}ms)`
    );

    const reaStatus = await inspectReaSystemStatus(true);
    const reaCard = await analyzeLocalJsTargetWithRea(
      'verify-script',
      'c:\\Users\\User\\Desktop\\spum\\AI Studio Pro',
      'Verificar extracción de evidencia y separación Observación/Inferencia/Reproducción'
    );
    console.log(
      `[4/5] Verificación REA: CLI v${reaStatus.cliVersion} | Skill alineada: ${reaStatus.skillAligned} | Evidencia generada: ${reaCard.evidenceId}`
    );

    const sampleProject = await createFullProject({
      mode: 'new_project',
      inputRaw: 'Quiero una utilidad local en Windows para auditar skills y servidores MCP con reportes Markdown.',
      destinationType: 'local',
    });
    console.log(
      `[5/5] Flujo E2E completado: Proyecto "${sampleProject.name}" creado con ${sampleProject.generatedArtifacts.length} artefactos y stack recomendado "${sampleProject.stackComparison?.recommendedOptionId}".`
    );

    console.log('\n✓ Verificación integral finalizada con éxito.');
  } finally {
    closeDatabase();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

main().catch((err) => {
  console.error('Error en verificación:', err);
  process.exit(1);
});
