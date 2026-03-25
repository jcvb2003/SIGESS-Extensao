import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const APP_SECRET = Deno.env.get("APP_SECRET");

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-app-secret",
    "Content-Type": "application/json",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const secret = req.headers.get("x-app-secret");
    if (!APP_SECRET || secret !== APP_SECRET) {
      return new Response(JSON.stringify({ ok: false, reason: "unauthorized_access" }), { 
        status: 401, 
        headers: corsHeaders 
      });
    }

    const body = await req.json();
    const { key, fingerprint, action } = body;

    if (!key || !fingerprint) {
      return new Response(JSON.stringify({ ok: false, reason: "missing_parameters" }), { 
        status: 400, 
        headers: corsHeaders 
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const rpcName = action === "status" ? "get_license_status" : "check_and_use_license";

    const { data: result, error } = await supabaseClient.rpc(rpcName, {
      p_key: key,
      p_fingerprint: fingerprint
    });

    if (error) {
      console.error("RPC Error:", error);
      return new Response(JSON.stringify({ ok: false, reason: "database_error", details: error.message }), { 
        status: 500, 
        headers: corsHeaders 
      });
    }

    // Add valid_until for anti-replay (15 minutes of cache)
    const validUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    
    // Prepare data for signing
    const payload = {
      ...result,
      valid_until: validUntil
    };

    // Generate HMAC signature
    const msg = `${payload.ok}${payload.plan || ''}${payload.usage_count || ''}${payload.devices || ''}${payload.max_devices || ''}${validUntil}`;
    const keyData = new TextEncoder().encode(APP_SECRET);
    const msgData = new TextEncoder().encode(msg);
    
    const cryptoKey = await crypto.subtle.importKey(
      "raw", 
      keyData, 
      { name: "HMAC", hash: "SHA-256" }, 
      false, 
      ["sign"]
    );
    
    const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
    const sig = Array.from(new Uint8Array(sigBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return new Response(JSON.stringify({ ...payload, sig }), { 
      headers: corsHeaders 
    });

  } catch (err: any) {
    console.error("Function Error:", err);
    return new Response(JSON.stringify({ ok: false, reason: "internal_error", error: err.message }), { 
      status: 500, 
      headers: corsHeaders 
    });
  }
});
