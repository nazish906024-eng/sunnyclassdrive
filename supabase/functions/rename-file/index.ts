import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: cors });

  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return Response.json({ error: "Sign in is required." }, { status: 401, headers: cors });

    const apiKey = Deno.env.get("FIREBASE_WEB_API_KEY");
    const url = Deno.env.get("SUPABASE_URL");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const adminUid = Deno.env.get("ADMIN_FIREBASE_UID") || "";
    if (!apiKey || !url || !service) {
      return Response.json({ error: "Rename service is not configured." }, { status: 500, headers: cors });
    }

    const verified = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + apiKey, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token })
    });
    if (!verified.ok) return Response.json({ error: "Sign in expired. Please sign in again." }, { status: 401, headers: cors });
    const user = (await verified.json()).users?.[0];
    if (!user || user.disabled) return Response.json({ error: "Account cannot rename files." }, { status: 403, headers: cors });

    const body = await req.json();
    const fileId = String(body.fileId || "");
    let newName = String(body.newName || "").trim();
    if (!/^[A-Za-z0-9_-]{1,150}$/.test(fileId)) {
      return Response.json({ error: "Invalid file reference." }, { status: 400, headers: cors });
    }
    if (!newName || newName.length > 100 || /[\\/]/.test(newName)) {
      return Response.json({ error: "Use a file name of 1–100 characters without slashes." }, { status: 400, headers: cors });
    }

    const projectId = "sunnyclassdrive-58e61";
    const documentUrl = "https://firestore.googleapis.com/v1/projects/" + projectId + "/databases/(default)/documents/schoolFiles/" + fileId;
    const record = await fetch(documentUrl, { headers: { "Authorization": "Bearer " + token } });
    if (!record.ok) return Response.json({ error: "File record not found or access denied." }, { status: 404, headers: cors });
    const fields = (await record.json()).fields || {};
    const isAdmin = !!adminUid && user.localId === adminUid;
    if (fields.uploadedBy?.stringValue !== user.localId && !isAdmin) {
      return Response.json({ error: "You do not have permission to rename this file." }, { status: 403, headers: cors });
    }

    const oldPath = fields.storagePath?.stringValue || "";
    const oldName = fields.name?.stringValue || "file";
    if (!oldPath || oldPath.includes("..") || oldPath.startsWith("/") || oldPath.split("/").some((part) => !part)) {
      return Response.json({ error: "Stored file path is invalid." }, { status: 400, headers: cors });
    }

    const oldExtension = oldName.includes(".") ? oldName.slice(oldName.lastIndexOf(".")).toLowerCase() : "";
    if (oldExtension && !newName.toLowerCase().endsWith(oldExtension)) newName += oldExtension;
    if (newName.length > 100) return Response.json({ error: "The file name is too long after keeping its extension." }, { status: 400, headers: cors });

    const newPath = Date.now() + "_" + crypto.randomUUID() + "_" + newName;
    const copy = await fetch(url + "/storage/v1/object/copy", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + service,
        "apikey": service,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ bucketId: "school-files", sourceKey: oldPath, destinationKey: newPath, copyMetadata: true })
    });
    if (!copy.ok) {
      const detail = await copy.text();
      console.error("Storage copy failed:", copy.status, detail);
      return Response.json({ error: "Could not rename file in Supabase Storage.", storageStatus: copy.status, storageError: detail.slice(0, 1000) }, { status: 502, headers: cors });
    }

    const newUrl = url + "/storage/v1/object/public/school-files/" + newPath.split("/").map(encodeURIComponent).join("/");
    const patchUrl = new URL(documentUrl);
    for (const field of ["name", "originalName", "storagePath", "downloadURL"]) {
      patchUrl.searchParams.append("updateMask.fieldPaths", field);
    }
    const patch = await fetch(patchUrl.toString(), {
      method: "PATCH",
      headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          name: { stringValue: newName },
          originalName: { stringValue: newName },
          storagePath: { stringValue: newPath },
          downloadURL: { stringValue: newUrl }
        }
      })
    });

    if (!patch.ok) {
      const detail = await patch.text();
      console.error("Firestore rename update failed:", patch.status, detail);
      const rollback = await fetch(url + "/storage/v1/object/school-files/" + newPath.split("/").map(encodeURIComponent).join("/"), {
        method: "DELETE",
        headers: { "Authorization": "Bearer " + service, "apikey": service }
      });
      if (!rollback.ok) console.error("Could not roll back copied object:", rollback.status, await rollback.text());
      return Response.json({ error: "Storage file was copied, but Firestore metadata could not be updated. Check Firestore rules.", firestoreStatus: patch.status }, { status: 502, headers: cors });
    }

    const removed = await fetch(url + "/storage/v1/object/school-files/" + oldPath.split("/").map(encodeURIComponent).join("/"), {
      method: "DELETE",
      headers: { "Authorization": "Bearer " + service, "apikey": service }
    });
    if (!removed.ok && removed.status !== 404) {
      console.error("Old Storage object cleanup failed:", removed.status, await removed.text());
      return Response.json({ success: true, warning: "File renamed, but the old Storage copy could not be removed. Ask an administrator to check Storage." }, { headers: cors });
    }

    return Response.json({ success: true, name: newName, storagePath: newPath, downloadURL: newUrl }, { headers: cors });
  } catch (error) {
    console.error("Rename function error:", error);
    return Response.json({ error: "Unexpected rename error." }, { status: 500, headers: cors });
  }
});
