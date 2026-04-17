import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Edge Function: abacatepay-webhook
 *
 * Recebe eventos do AbacatePay e atualiza o account_status dos fotógrafos.
 *
 * Eventos tratados:
 *   subscription.completed  → ativa conta (primeira ativação ou reativação)
 *   subscription.renewed    → confirma renovação (mantém active)
 *   subscription.cancelled  → suspende conta + agenda deleção em 30 dias
 *
 * Segurança: valida assinatura HMAC-SHA256 enviada no header x-webhook-secret.
 * Configure ABACATEPAY_WEBHOOK_SECRET nas variáveis da Edge Function.
 */

const WEBHOOK_SECRET = Deno.env.get("ABACATEPAY_WEBHOOK_SECRET") ?? "";

async function verifySignature(req: Request, rawBody: string): Promise<boolean> {
  if (!WEBHOOK_SECRET) {
    console.warn("[webhook] ABACATEPAY_WEBHOOK_SECRET não configurado — pulando verificação");
    return true;
  }
  const signature = req.headers.get("x-webhook-secret") ?? "";
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  return hex === signature;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await req.text();

  const valid = await verifySignature(req, rawBody);
  if (!valid) {
    console.error("[webhook] Assinatura inválida");
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: { event: string; data: Record<string, unknown> };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { event, data } = payload;

  // Usa service role para bypassar RLS (webhook não tem sessão de usuário)
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    // Normaliza eventos: AbacatePay Sandbox expõe "billing.paid" em vez de
    // "subscription.completed" / "subscription.renewed" — tratamos ambos.
    const normalizedEvent =
      event === "billing.paid" ? "subscription.completed" : event;

    if (normalizedEvent === "subscription.completed") {
      // Primeira ativação ou reativação após suspensão
      // externalId é o photographer_id passado no create-checkout
      const photographerId = (data.externalId ?? data.external_id) as string;
      const subscriptionId = data.id as string;
      const productId = (data.items as Array<{ productId: string }>)?.[0]?.productId ?? null;

      if (!photographerId) throw new Error("externalId ausente no payload");

      const { error } = await supabase
        .from("photographers")
        .update({
          account_status:             "active",
          abacatepay_subscription_id: subscriptionId,
          abacatepay_product_id:      productId,
          trial_used:                 true,
          suspended_at:               null,
          data_deletion_scheduled_at: null,
        })
        .eq("id", photographerId);

      if (error) throw error;
      console.log(`[webhook] ${event} → photographer ${photographerId} ativado`);

    } else if (normalizedEvent === "subscription.renewed") {
      // Renovação mensal confirmada
      const subscriptionId = data.id as string;

      const { error } = await supabase
        .from("photographers")
        .update({ account_status: "active" })
        .eq("abacatepay_subscription_id", subscriptionId);

      if (error) throw error;
      console.log(`[webhook] ${event} → subscription ${subscriptionId} renovada`);

    } else if (normalizedEvent === "subscription.cancelled") {
      // Cancelamento ou falha de renovação
      const subscriptionId = data.id as string;

      const { error } = await supabase
        .from("photographers")
        .update({
          account_status:             "suspended",
          suspended_at:               new Date().toISOString(),
          data_deletion_scheduled_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .eq("abacatepay_subscription_id", subscriptionId);

      if (error) throw error;
      console.log(`[webhook] subscription.cancelled → subscription ${subscriptionId} suspensa`);

    } else {
      // Evento não tratado — retorna 200 para não causar reenvio
      console.log(`[webhook] Evento ignorado: ${event} (normalizado: ${normalizedEvent})`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error(`[webhook] Erro ao processar evento ${event}:`, err.message);
    // Retorna 500 para o AbacatePay retentar
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
