import helmet from 'helmet';
import cors from 'cors';

export function securityMiddleware(app) {
  app.use(helmet());
  app.use(cors({
    origin: (origin, callback) => {
      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:3001',
        'https://qr-ui-kappa.vercel.app', // production UI
      ];

      // Allow undefined origin (e.g., mobile apps, curl, SSR health checks)
      if (!origin) return callback(null, true);

      // Allow exact matches
      if (allowedOrigins.includes(origin)) return callback(null, true);

      // Allow Vercel preview deployments (*.vercel.app)
      try {
        const host = new URL(origin).host;
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