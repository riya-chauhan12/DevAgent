export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`\nMissing environment variable: ${name}`);
    console.error(`Add it to your .env file (see .env.example).\n`);
    process.exit(1);
  }
  return value;
}