import path from 'node:path';
import express from 'express';
import dotenv from 'dotenv';
import { initDatabase } from './src/server/db.ts';
import authRoutes from './src/server/routes/auth.ts';
import plannerRoutes from './src/server/routes/planner.ts';

dotenv.config();

initDatabase();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.set('trust proxy', true);
app.use(express.json({ limit: '2mb' }));

app.use('/api/auth', authRoutes);
app.use('/api', plannerRoutes);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API route not found.' });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ScholarPlan server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
