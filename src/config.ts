import * as dotenv from 'dotenv';
dotenv.config();

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

const config = {
  SLACK_BOT_TOKEN: requireEnv('SLACK_BOT_TOKEN'),
  SLACK_APP_TOKEN: requireEnv('SLACK_APP_TOKEN'),
  SLACK_SIGNING_SECRET: requireEnv('SLACK_SIGNING_SECRET'),
};

export default config;
