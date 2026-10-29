import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/core/database/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://vpnbot:vpnbot@localhost:5432/vpnbot',
  },
});
