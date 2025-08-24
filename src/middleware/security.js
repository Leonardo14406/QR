import helmet from 'helmet';
import cors from 'cors';

export function securityMiddleware(app) {
  app.use(helmet());
  app.use(cors({
    origin: (origin, callback) => {
      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:3001',
        'https://qr-ui-kappa.vercel.app',
      ];
      // Allow undefined origin (e.g., mobile apps or curl)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "x-refresh-token"], 
  }));
}