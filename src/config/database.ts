export function isDatabaseUrlConfigured(databaseUrl: string) {
  return Boolean(databaseUrl) && !databaseUrl.includes("REPLACE_WITH_SUPABASE_DB_PASSWORD");
}
