export function localPorts(env: Record<string, string | undefined>) {
  function port(key: string, fallback: number) {
    const value = env[key];
    if (value === undefined) return fallback;
    if (!/^\d{4,5}$/.test(value) || Number(value) < 1024 || Number(value) > 65535) {
      throw new Error('Invalid local port configuration.');
    }
    return Number(value);
  }
  const web = port('DIZZLE_WEB_PORT', 5173);
  const api = port('DIZZLE_API_PORT', 3001);
  if (web === api) throw new Error('Local frontend and API ports must differ.');
  return { web, api };
}

export type LocalPorts = ReturnType<typeof localPorts>;
