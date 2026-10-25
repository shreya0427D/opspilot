import { createEdgeStoreNextHandler } from "@edgestore/server/adapters/next/app";
import { edgeStoreRouter } from "@/lib/edgestore/router";
import { requireWorkspace } from "@/lib/server/session";

// EdgeStore's upload API. Every request is tied to the verified Firebase session and the caller's
// workspace membership; unauthenticated or non-member requests fail before EdgeStore runs.
const handler = createEdgeStoreNextHandler({
  router: edgeStoreRouter,
  createContext: async () => {
    const ctx = await requireWorkspace();
    return { userId: ctx.uid, workspaceId: ctx.workspaceId };
  },
});

export { handler as GET, handler as POST };
