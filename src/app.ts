import express, { Application, Request, Response } from 'express';
import { requestLogger } from './common/middleware/requestLogger';
import { errorHandler } from './common/errors/errorHandler';
import { ApiError } from './common/errors/ApiError';
import httpStatus from 'http-status';
import routes from './modules/routes';

const app: Application = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// API Routes
app.use('/api/v1', routes);

// Health check route
app.get('/', (req: Request, res: Response) => {
  res.send('OK');
});

// Handle 404
app.use((req: Request, res: Response, next) => {
  next(new ApiError(httpStatus.NOT_FOUND, 'Not found'));
});

// Error handler
app.use(errorHandler);

export default app;
