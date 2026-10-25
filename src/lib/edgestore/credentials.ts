import "server-only";

// The SDK reads EDGESTORE_ACCESS_KEY / EDGESTORE_SECRET_KEY, while the EdgeStore dashboard
// labels them EDGE_STORE_ACCESS_KEY / EDGE_STORE_SECRET_KEY. Accept either spelling and pass
// the result to the provider explicitly, so both work everywhere. Server-only; never exposed.

export function edgeStoreCredentials(): { accessKey: string; secretKey: string } | null {
  const accessKey = (process.env.EDGESTORE_ACCESS_KEY || process.env.EDGE_STORE_ACCESS_KEY || "").trim();
  const secretKey = (process.env.EDGESTORE_SECRET_KEY || process.env.EDGE_STORE_SECRET_KEY || "").trim();
  return accessKey && secretKey ? { accessKey, secretKey } : null;
}

/** Which variables are missing, by name only (safe to show). */
export function missingEdgeStoreVars(): string[] {
  const missing: string[] = [];
  if (!(process.env.EDGESTORE_ACCESS_KEY || process.env.EDGE_STORE_ACCESS_KEY)?.trim()) missing.push("EDGESTORE_ACCESS_KEY");
  if (!(process.env.EDGESTORE_SECRET_KEY || process.env.EDGE_STORE_SECRET_KEY)?.trim()) missing.push("EDGESTORE_SECRET_KEY");
  return missing;
}
