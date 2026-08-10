import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import jwt from "jsonwebtoken";

// Plugin to serve stream tokens securely without exposing the secret to the frontend
const streamTokenPlugin = () => {
  const handler = (server: any) => {
    server.middlewares.use('/api/get-stream-token', (req: any, res: any) => {
      const env = loadEnv(server.config.mode, process.cwd(), '');
      const secret = env.STREAM_SECRET;
      
      if (!secret) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: "STREAM_SECRET not found in environment" }));
      }

      const url = new URL(req.url, `http://${req.headers.host}`);
      const userId = url.searchParams.get('user_id');
      const userRole = url.searchParams.get('role') || 'user';
      const streamRole = userRole === 'teacher' ? 'admin' : 'user';

      if (!userId) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "user_id query parameter is required" }));
      }

      try {
        const token = jwt.sign({ user_id: userId, role: streamRole }, secret, { algorithm: 'HS256', noTimestamp: true });
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ token }));
      } catch (err: any) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  };

  return {
    name: 'stream-token-plugin',
    configureServer: handler,
    configurePreviewServer: handler
  };
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: Number(process.env.PORT) || 5173,
    strictPort: false,
  },
  plugins: [react(), streamTokenPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
