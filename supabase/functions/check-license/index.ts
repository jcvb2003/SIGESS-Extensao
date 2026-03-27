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
    const { key, fingerprint, action, usage_type } = body;

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

    let rpcName = "get_license_status";
    let rpcParams: any = { p_key: key, p_fingerprint: fingerprint };

    if (action === "check") {
      rpcName = "check_and_use_license";
      rpcParams.p_usage_type = usage_type || "manual";
    }

    const { data: result, error } = await supabaseClient.rpc(rpcName, rpcParams);

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

    // Update signature to include new counters if available (for backward compatibility, use coalesce)
    const msg = `${payload.ok}${payload.plan || ''}${payload.status || ''}${payload.usage_manual ?? ''}${payload.usage_turbo ?? ''}${payload.usage_agro ?? ''}${payload.devices || ''}${payload.max_devices || ''}${validUntil}`;
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
