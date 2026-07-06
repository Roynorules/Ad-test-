import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  // Use process.env.PORT for Render, fallback to 3000 for local/AI Studio
  const PORT = process.env.PORT || 3000;

  // API routes can go here

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Note: when compiled to CJS using esbuild, __dirname works, but if we run as ESM we use the derived one.
    // However, esbuild might compile this to CJS, so __dirname will be available natively.
    // The dist path will be where the static files are built by vite.
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
