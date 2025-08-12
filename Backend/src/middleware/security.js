import helmet from 'helmet';
import cors from 'cors';

export function securityMiddleware(app) {
  app.use(helmet());
  app.use(cors({
    origin: 'http://localhost:3000', 
    credentials: true, // allow cookies
  }));
}
