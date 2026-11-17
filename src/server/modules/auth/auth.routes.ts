import { Router } from 'express';
import { authenticate } from '../../middleware/auth.ts';
import { loginLimiter } from '../../middleware/rateLimit.ts';
import { validate } from '../../middleware/validate.ts';
import * as authController from './auth.controller.ts';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from './auth.validation.ts';

export const authRouter = Router();

authRouter.post(
  '/register',
  loginLimiter,
  validate({ body: registerSchema }),
  authController.register
);

authRouter.post(
  '/login',
  loginLimiter,
  validate({ body: loginSchema }),
  authController.login
);

authRouter.post('/refresh', authController.refresh);
authRouter.post('/logout', authController.logout);
authRouter.get('/me', authenticate, authController.getMe);

authRouter.post(
  '/forgot-password',
  loginLimiter,
  validate({ body: forgotPasswordSchema }),
  authController.forgotPassword
);

authRouter.post(
  '/reset-password',
  loginLimiter,
  validate({ body: resetPasswordSchema }),
  authController.resetPassword
);
