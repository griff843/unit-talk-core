// scripts/shared/bootstrapEnv.ts
import 'dotenv/config';

// Alias support: accept either SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY
const { SUPABASE_SERVICE_KEY, SUPABASE_SERVICE_ROLE_KEY } =
  process.env as Record<string, string | undefined>;
if (!SUPABASE_SERVICE_KEY && SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SERVICE_KEY = SUPABASE_SERVICE_ROLE_KEY;
}

// Optional: force NODE_ENV default
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'staging';

console.log('🔧 Environment bootstrap loaded');
