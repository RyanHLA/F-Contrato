import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ABACATEPAY_API = "https://api.abacatepay.com/v1";
const ABACATEPAY_KEY = Deno.env.get("ABACATEPAY_API_KEY") ?? "";

// Origens permitidas: painel + landing (separadas por vírgula na env ALLOWED_ORIGINS)
const ALLOWED_ORIGINS: string[] = (
  Deno.env.get("ALLOWED_ORIGINS") ?? "http://localhost:8081,http://localhost:3000"
).split(",").map((o) => o.trim());

const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
});

const abacate = async (path: string, body: unknown) => {
  const res = await fetch(`${ABACATEPAY_API}${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${ABACATEPAY_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AbacatePay ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
};

serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    // 1. Valida sessão
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");

    // 2. Busca fotógrafo
    const { data: photographer, error: pgErr } = await supabase
      .from("photographers")
      .select("id, name, email, account_status, abacatepay_customer_id")
      .eq("user_id", user.id)
      .single();

    if (pgErr || !photographer) throw new Error("Photographer not found");

    if (photographer.account_status === "suspended") {
      throw new Error("ACCOUNT_SUSPENDED: Reative sua assinatura para continuar.");
    }

    // 3. Lê plano desejado do body
    const { plan_id, cellphone, tax_id, success_url, cancel_url } = await req.json();
    if (!plan_id || !success_url || !cancel_url) {
      throw new Error("Missing required fields: plan_id, success_url, cancel_url");
    }

    // 4. Busca dados do plano
    const { data: plan, error: planErr } = await supabase
      .from("plans")
      .select("name, price_brl")
      .eq("id", plan_id)
      .single();

    if (planErr || !plan) {
      throw new Error(`Plan '${plan_id}' not found`);
    }

    // 5. Cria ou reutiliza cliente no AbacatePay
    // API v1: POST /customer/create — campos: name, email, cellphone, taxId
    let customerId = photographer.abacatepay_customer_id;

    if (!customerId) {
      const customerRes = await abacate("/customer/create", {
        name: photographer.name,
        email: photographer.email,
        cellphone: cellphone ?? "(11) 00000-0000", // obrigatório na v1
        taxId: tax_id ?? "000.000.000-00",          // obrigatório na v1
      });
      customerId = customerRes.data?.id;
      if (!customerId) throw new Error("AbacatePay did not return a customer ID");

      // Persiste customer_id
      await supabase
        .from("photographers")
        .update({ abacatepay_customer_id: customerId })
        .eq("id", photographer.id);
    }

    // 6. Cria cobrança no AbacatePay
    // API v1: POST /billing/create
    // frequency: MULTIPLE_PAYMENTS = recorrente (mensal)
    // price em centavos
    const priceInCents = Math.round(Number(plan.price_brl) * 100);

    const billingRes = await abacate("/billing/create", {
      frequency: "MULTIPLE_PAYMENTS",
      methods: ["PIX", "CARD"],
      products: [
        {
          externalId: plan_id,
          name: `Fotux - Plano ${plan.name}`,
          quantity: 1,
          price: priceInCents,
        },
      ],
      returnUrl: cancel_url,
      completionUrl: success_url,
      customerId,
      externalId: photographer.id, // correlaciona no webhook
    });

    const checkoutUrl = billingRes.data?.url;
    if (!checkoutUrl) throw new Error(`AbacatePay did not return a checkout URL. Response: ${JSON.stringify(billingRes)}`);

    return new Response(JSON.stringify({ url: checkoutUrl }), {
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[create-checkout]", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
});
