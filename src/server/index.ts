import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { handleApiRequest } from './app.js';
import { initDatabase } from './storage/db.js';
import { ensureCatalogSeeded } from './catalog/catalog-service.js';

const PORT = Number(process.env.PORT || 3847);
const isDev = process.argv.includes('--dev');

async function startServer() {
  initDatabase();
  ensureCatalogSeeded();

  let vite: { middlewares: http.RequestListener } | null = null;
  if (isDev) {
    const { createServer } = await import('vite');
    vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
  }

  const server = http.createServer(async (req, res) => {
    const handled = await handleApiRequest(req, res);
    if (handled) return;

    if (vite) {
      vite.middlewares(req, res);
      return;
    }

    // Servir archivos estáticos de dist en modo producción
    const primaryDist = path.resolve(process.cwd(), 'dist');
    const legacyDist = path.resolve(process.cwd(), 'dist', 'client');
    const clientDist = fs.existsSync(path.join(primaryDist, 'index.html')) ? primaryDist : legacyDist;
    const urlPath = (req.url || '/').split('?')[0];
    const requestedFile = path.join(clientDist, urlPath === '/' ? 'index.html' : urlPath);

    if (fs.existsSync(requestedFile) && fs.statSync(requestedFile).isFile()) {
      const ext = path.extname(requestedFile).toLowerCase();
      const mimeMap: Record<string, string> = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.svg': 'image/svg+xml',
      };
      res.writeHead(200, { 'Content-Type': mimeMap[ext] || 'application/octet-stream' });
      fs.createReadStream(requestedFile).pipe(res);
      return;
    }

    const indexHtml = path.join(clientDist, 'index.html');
    if (fs.existsSync(indexHtml)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(indexHtml).pipe(res);
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forja API activa. Ejecutá `npm run dev` o `npm run build` para ver la interfaz web.');
  });

  server.listen(PORT, () => {
    console.log(`\n======================================================================`);
    console.log(`  Forja — Optimizador y Organizador de Proyectos de Programación`);
    console.log(`  Servidor activo en: http://localhost:${PORT}`);
    console.log(`  Modo: ${isDev ? 'Desarrollo (Vite HMR integrado)' : 'Producción'}`);
    console.log(`======================================================================\n`);
  });
}

startServer().catch((err) => {
  console.error('Error al iniciar el servidor Forja:', err);
  process.exit(1);
});
