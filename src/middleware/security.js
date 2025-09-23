import helmet from 'helmet';
import cors from 'cors';

export function securityMiddleware(app) {
  app.use(helmet());
  app.use(cors({
    origin: (origin, callback) => {
      // Configure allowed origins via env (comma-separated). Supports wildcard subdomains with leading *.
      const envList = process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:3001,https://qr-ui-kappa.vercel.app';
      const allowedOrigins = envList.split(',').map(s => s.trim()).filter(Boolean);

      // Allow undefined origin (e.g., mobile apps, curl, SSR health checks)
      if (!origin) return callback(null, true);

      // Exact match
      if (allowedOrigins.includes(origin)) return callback(null, true);

      // Check wildcard entries like *.example.com
      try {
        const host = new URL(origin).host;
        for (const entry of allowedOrigins) {
          if (entry.startsWith('*.')) {
            const domain = entry.slice(2); // remove '*.'
            if (host === domain || host.endsWith(`.${domain}`)) {
              return callback(null, true);
            }
          }
        }
        // Allow Vercel preview deployments (*.vercel.app) by default
        if (host.endsWith('.vercel.app')) return callback(null, true);
      } catch {}

      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-refresh-token"],
    optionsSuccessStatus: 204, // for legacy browsers
  }));
}