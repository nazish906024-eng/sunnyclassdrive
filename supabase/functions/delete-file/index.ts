import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return Response.json({error:"Method not allowed"}, {status:405,headers:cors});
  try {
    const token=(req.headers.get("Authorization")||"").replace(/^Bearer /,"");
    if(!token) return Response.json({error:"Sign in is required."},{status:401,headers:cors});
    const apiKey=Deno.env.get("FIREBASE_WEB_API_KEY"), url=Deno.env.get("SUPABASE_URL"), service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if(!apiKey||!url||!service) return Response.json({error:"Delete service is not configured."},{status:500,headers:cors});
    const verified=await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key="+apiKey,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken:token})});
    if(!verified.ok) return Response.json({error:"Sign in expired. Please sign in again."},{status:401,headers:cors});
    const user=(await verified.json()).users?.[0];
    if(!user||user.disabled) return Response.json({error:"Account cannot delete files."},{status:403,headers:cors});
    const body=await req.json();
    const fileId=String(body.fileId||"");
    if(!/^[A-Za-z0-9_-]{1,150}$/.test(fileId)) return Response.json({error:"Invalid file reference."},{status:400,headers:cors});
    const projectId="sunnyclassdrive-58e61";
    const record=await fetch("https://firestore.googleapis.com/v1/projects/"+projectId+"/databases/(default)/documents/schoolFiles/"+fileId,{headers:{"Authorization":"Bearer "+token}});
    if(!record.ok) return Response.json({error:"File record not found or access denied."},{status:404,headers:cors});
    const fields=(await record.json()).fields||{};
    const adminUid=Deno.env.get("ADMIN_FIREBASE_UID")||"";
    const isAdmin=!!adminUid && user.localId===adminUid;
    if(fields.uploadedBy?.stringValue!==user.localId && !isAdmin) return Response.json({error:"You do not have permission to delete this file."},{status:403,headers:cors});
    const path=fields.storagePath?.stringValue;
    if(!path||path.includes("..")||path.startsWith("/")) return Response.json({error:"Stored file path is invalid."},{status:400,headers:cors});
    const encodedPath=path.split("/").map(encodeURIComponent).join("/");
    const removed=await fetch(url+"/storage/v1/object/school-files/"+encodedPath,{method:"DELETE",headers:{"Authorization":"Bearer "+service,"apikey":service}});
    if(!removed.ok){
      const storageError=await removed.text();
      let missingObject=removed.status===404;
      try {
        const detail=JSON.parse(storageError);
        missingObject=missingObject || detail.code==="NoSuchKey" || (detail.statusCode==="404" && detail.error==="not_found");
      } catch (_) {}
      // If the object was manually removed already, continue so the stale Firestore record can be deleted.
      if(!missingObject){
        console.error("Storage delete failed:",removed.status,storageError);
        return Response.json({error:"Could not remove file from storage.",storageStatus:removed.status,storageError:storageError.slice(0,1000)},{status:502,headers:cors});
      }
      console.info("Storage object was already missing; continuing to remove its Firestore record.");
    }
    return Response.json({success:true},{headers:cors});
  } catch(error){console.error(error);return Response.json({error:"Unexpected delete error."},{status:500,headers:cors});}
});
