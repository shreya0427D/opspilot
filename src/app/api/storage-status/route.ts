import { adminBucket } from "@/lib/firebase/admin";
import { log } from "@/lib/server/log";
import { handler, ok } from "@/lib/server/route";
import { requireWorkspace } from "@/lib/server/session";

/** Lets the Documents page tell the user up front when file storage isn't usable. */
export const GET = handler(async () => {
  await requireWorkspace();
  try {
    const [exists] = await adminBucket().exists();
    if (!exists) {
      return ok({ ready: false, reason: "File storage isn't set up for this project yet (the storage bucket doesn't exist)." });
    }
    return ok({ ready: true });
  } catch (err) {
    log.warn("Storage bucket check failed", { err });
    return ok({ ready: false, reason: "Couldn't verify file storage right now." });
  }
});
