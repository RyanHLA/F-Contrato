/**
 * Edge Function — mp-webhook
 *
 * Recebe notificações de pagamento do Mercado Pago.
 * Valida, confirma via API do MP e libera as fotos extras.
 *
 * Cenário A: upload_mode = 'delivery' → libera download imediatamente
 * Cenário B: upload_mode = 'selection' → marca como pagas e notifica fotógrafo
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // MP envia GET para validar o endpoint e POST com notificações
  if (req.method === 'GET') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  try {
    const body = await req.json() as {
      type:  string
      action?: string
      data?: { id: string }
    }

    // Só processa notificações de pagamento
    if (body.type !== 'payment' || !body.data?.id) {
      return new Response('ok', { headers: CORS })
    }

    const mpPaymentId = body.data.id
    const supabase    = createClient(SUPABASE_URL, SERVICE_KEY)

    // Busca a compra pelo mp_payment_id OU pelo external_reference
    // O MP envia o payment id — consultamos para obter o external_reference
    // (que é o nosso purchase.id)

    // O MP envia o payment_id na notificação mas não o external_reference diretamente.
    // Estratégia: buscar a compra pela preference_id que contém o mp_payment_id,
    // ou buscar pelo external_reference que o MP inclui ao consultar o pagamento.
    // Usamos o access_token do fotógrafo para consultar — precisamos encontrá-lo primeiro.

    // Tenta buscar uma compra pending com mp_preference_id que contenha o payment_id
    // Primeiro: busca todas as compras pending para tentar o token de cada fotógrafo
    const { data: pendingPurchases } = await supabase
      .from('extra_photo_purchases')
      .select('id, photographer_id, photographers(mp_access_token)')
      .eq('status', 'pending')
      .not('mp_preference_id', 'is', null)
      .limit(20)

    let payment: { status: string; external_reference: string; transaction_amount: number } | null = null

    // Tenta consultar o pagamento com o token de cada fotógrafo com compra pendente
    if (pendingPurchases && pendingPurchases.length > 0) {
      // Deduplica por photographer_id para não tentar o mesmo token várias vezes
      const seen = new Set<string>()
      for (const p of pendingPurchases) {
        const pg = p.photographers as unknown as { mp_access_token: string | null }
        if (!pg?.mp_access_token || seen.has(p.photographer_id)) continue
        seen.add(p.photographer_id)

        const res = await fetch(`https://api.mercadopago.com/v1/payments/${mpPaymentId}`, {
          headers: { 'Authorization': `Bearer ${pg.mp_access_token}` },
        })
        if (res.ok) {
          payment = await res.json()
          break
        }
      }
    }

    if (!payment) {
      console.error('[mp-webhook] Não foi possível consultar o pagamento:', mpPaymentId)
      return new Response('ok', { headers: CORS })
    }

    const purchaseId = payment.external_reference
    if (!purchaseId) {
      return new Response('ok', { headers: CORS })
    }

    // Busca a compra
    const { data: purchase, error: purchaseErr } = await supabase
      .from('extra_photo_purchases')
      .select('id, job_id, photographer_id, quantity, client_token, status, photographers(mp_access_token, mp_user_id)')
      .eq('id', purchaseId)
      .single()

    if (purchaseErr || !purchase) {
      console.error('[mp-webhook] Compra não encontrada:', purchaseId)
      return new Response('ok', { headers: CORS })
    }

    // Evita processar duplicado
    if (purchase.status === 'approved') {
      return new Response('ok', { headers: CORS })
    }

    // Atualiza status da compra
    const newStatus = payment.status === 'approved' ? 'approved'
      : payment.status === 'rejected' ? 'rejected'
      : payment.status === 'cancelled' ? 'cancelled'
      : 'pending'

    await supabase
      .from('extra_photo_purchases')
      .update({ mp_payment_id: mpPaymentId, status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', purchaseId)

    if (newStatus !== 'approved') {
      return new Response('ok', { headers: CORS })
    }

    // ── PAGAMENTO APROVADO ─────────────────────────────────────────────────

    // Busca o job para saber o modo (selection ou delivery)
    const { data: job } = await supabase
      .from('jobs')
      .select('id, title, gallery_selection_limit, extra_photo_price, photographers(id, mp_user_id)')
      .eq('id', purchase.job_id)
      .single()

    if (!job) {
      console.error('[mp-webhook] Job não encontrado:', purchase.job_id)
      return new Response('ok', { headers: CORS })
    }

    // Verifica se há fotos de delivery (Cenário A) ou só selection (Cenário B)
    const { count: deliveryCount } = await supabase
      .from('site_images')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', purchase.job_id)
      .eq('upload_mode', 'delivery')

    const isDelivery = (deliveryCount ?? 0) > 0

    if (isDelivery) {
      // Cenário A: aumenta o limite do job para este cliente
      // Como o limite é por job (não por cliente), aumentamos o global
      // Em implementação futura podemos ter limite por cliente via tabela separada
      const currentLimit = job.gallery_selection_limit ?? 0
      const newLimit     = currentLimit + purchase.quantity

      await supabase
        .from('jobs')
        .update({ gallery_selection_limit: newLimit })
        .eq('id', purchase.job_id)
    }

    // Notifica o fotógrafo por email
    const { data: photographer } = await supabase
      .from('photographers')
      .select('id')
      .eq('id', purchase.photographer_id)
      .single()

    if (photographer) {
      await supabase.functions.invoke('send-extra-photo-notification', {
        body: {
          photographerId: purchase.photographer_id,
          jobId:          purchase.job_id,
          jobTitle:       job.title,
          quantity:       purchase.quantity,
          isDelivery,
        },
      }).catch(() => {}) // Não falha o webhook se o email falhar
    }

    console.log(`[mp-webhook] Compra ${purchaseId} aprovada — ${purchase.quantity} fotos extras — ${isDelivery ? 'Cenário A' : 'Cenário B'}`)
    return new Response('ok', { headers: CORS })

  } catch (err) {
    console.error('[mp-webhook]', err)
    // Sempre retorna 200 para o MP não reenviar indefinidamente
    return new Response('ok', { headers: CORS })
  }
})
