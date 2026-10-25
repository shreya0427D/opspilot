import { createEdgeStoreNextHandler } from "@edgestore/server/adapters/next/app";
import { NextResponse, type NextRequest } from "next/server";
import { missingEdgeStoreVars } from "@/lib/edgestore/credentials";
import { getEdgeStoreRouter } from "@/lib/edgestore/router";
import { requireWorkspace } from "@/lib/server/session";

// EdgeStore's upload API. Every request is tied to the verified Firebase session and the caller's
// workspace membership; unauthenticated or non-member requests fail before EdgeStore runs.
// The handler is created lazily so a deployment without storage keys returns a clear 503
// instead of crashing at import.
let handler: ((req: NextRequest) => Promise<Response>) | null = null;

async function handle(req: NextRequest) {
  const router = getEdgeStoreRouter();
  if (!router) {
    return NextResponse.json(
      { message: `File storage isn't configured on the server (missing ${missingEdgeStoreVars().join(" and ")}).` },
      { status: 503 },
    );
  }
  handler ??= createEdgeStoreNextHandler({
    router,
    createContext: async () => {
      const ctx = await requireWorkspace();
      return { userId: ctx.uid, workspaceId: ctx.workspaceId };
    },
  });
  return handler(req);
}

export { handle as GET, handle as POST };
