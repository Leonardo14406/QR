import helmet from 'helmet';
import cors from 'cors';

export function securityMiddleware(app) {
  app.use(helmet());
  app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:3001', 'https://qr-ui-kappa.vercel.app'], // allow requests from these origins
    credentials: true, // allow cookies
  }));
}
