import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, content-type, x-file-name","Access-Control-Allow-Methods":"POST, OPTIONS"};
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return Response.json({error:"Method not allowed"}, {status:405,headers:cors});
  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer /, "");
    if (!token) return Response.json({error:"Sign in is required."},{status:401,headers:cors});
    const apiKey=Deno.env.get("FIREBASE_WEB_API_KEY"), url=Deno.env.get("SUPABASE_URL"), service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!apiKey || !url || !service) return Response.json({error:"Upload service is not configured."},{status:500,headers:cors});
    const verified=await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key="+apiKey,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken:token})});
    if (!verified.ok) return Response.json({error:"Sign in expired. Please sign in again."},{status:401,headers:cors});
    const user=(await verified.json()).users?.[0];
    if (!user || user.disabled) return Response.json({error:"Account cannot upload."},{status:403,headers:cors});
    const name=decodeURIComponent(req.headers.get("X-File-Name") || "shared-file").replace(/[^\w.() -]/g,"_").slice(0,100);
    const type=req.headers.get("Content-Type") || "application/octet-stream";
    const allowed=["application/pdf","application/vnd.ms-powerpoint","application/vnd.openxmlformats-officedocument.presentationml.presentation","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","text/plain","image/png","image/jpeg","image/webp","application/octet-stream"];
    if (!allowed.includes(type)) return Response.json({error:"File type not allowed."},{status:415,headers:cors});
    const bytes=await req.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength>25*1024*1024) return Response.json({error:"File must be 25 MB or smaller."},{status:413,headers:cors});
    const path=Date.now()+"_"+crypto.randomUUID()+"_"+name;
    const upload=await fetch(url+"/storage/v1/object/school-files/"+path,{method:"POST",headers:{"Authorization":"Bearer "+service,"apikey":service,"Content-Type":type,"x-upsert":"false"},body:bytes});
    if (!upload.ok) { console.error(await upload.text()); return Response.json({error:"Storage upload failed. Check public bucket 'school-files'."},{status:502,headers:cors}); }
    return Response.json({path,publicUrl:url+"/storage/v1/object/public/school-files/"+path},{headers:cors});
  } catch (error) { console.error(error); return Response.json({error:"Unexpected upload error."},{status:500,headers:cors}); }
});