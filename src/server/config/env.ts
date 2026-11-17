import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().trim().optional(),
  JWT_ACCESS_SECRET: z.string().trim().optional(),
  JWT_REFRESH_SECRET: z.string().trim().optional(),
  GEMINI_API_KEY: z.string().trim().optional(),
  FRONTEND_URL: z.string().trim().optional(),
  APP_URL: z.string().trim().optional(),
});

const parsed = rawEnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const data = parsed.data;

const missingRequiredSecrets: string[] = [];
if (!data.MONGODB_URI) missingRequiredSecrets.push('MONGODB_URI');
if (!data.JWT_ACCESS_SECRET || data.JWT_ACCESS_SECRET.length < 16) {
  missingRequiredSecrets.push('JWT_ACCESS_SECRET');
}
if (!data.JWT_REFRESH_SECRET || data.JWT_REFRESH_SECRET.length < 16) {
  missingRequiredSecrets.push('JWT_REFRESH_SECRET');
}

const resolvedFrontendUrl =
  data.FRONTEND_URL || data.APP_URL || `http://localhost:${data.PORT}`;

if (data.NODE_ENV === 'production' && missingRequiredSecrets.length > 0) {
  console.error(
    `Fatal: Missing or invalid required production secrets: ${missingRequiredSecrets.join(', ')}`
  );
  process.exit(1);
}

const resolvedJwtAccessSecret =
  data.JWT_ACCESS_SECRET && data.JWT_ACCESS_SECRET.length >= 16
    ? data.JWT_ACCESS_SECRET
    : data.NODE_ENV !== 'production'
      ? 'classmate-dev-access-secret-key-32-chars-minimum'
      : '';

const resolvedJwtRefreshSecret =
  data.JWT_REFRESH_SECRET && data.JWT_REFRESH_SECRET.length >= 16
    ? data.JWT_REFRESH_SECRET
    : data.NODE_ENV !== 'production'
      ? 'classmate-dev-refresh-secret-key-32-chars-minimum'
      : '';

export const env = {
  nodeEnv: data.NODE_ENV,
  isDev: data.NODE_ENV !== 'production',
  port: data.PORT,
  mongodbUri: data.MONGODB_URI || '',
  jwtAccessSecret: resolvedJwtAccessSecret,
  jwtRefreshSecret: resolvedJwtRefreshSecret,
  geminiApiKey: data.GEMINI_API_KEY || '',
  frontendUrl: resolvedFrontendUrl,
  appUrl: data.APP_URL || resolvedFrontendUrl,
  missingRequiredSecrets,
} as const;

export const AI_CONFIG = {
  textModel: 'gemini-4-hydrogen',
  embeddingModel: 'gemini-embedding-2',
  modelVersion: 'cm-match-v1.0|gemini-embedding-2|gemini-4-hydrogen',
  dailyQuotaPerUser: 30,
  matchingWeights: {
    skills: 0.4,
    interests: 0.2,
    availability: 0.2,
    complementary: 0.2,
  },
  matchingThresholds: {
    minSkillSimilarity: 0.55,
    minInterestSimilarity: 0.5,
    minCandidateScore: 0,
    maxReturnedCandidates: 15,
    maxAiExplanationCandidates: 15,
    embeddingBatchSize: 24,
  },
} as const;

export const AUTH_CONFIG = {
  accessTokenTtl: '15m',
  refreshTokenTtlDays: 7,
  passwordResetTtlMinutes: 60,
  bcryptCost: 12,
  refreshCookieName: 'cm_refresh_token',
} as const;
