/**
 * Edge Function — mp-create-payment
 *
 * Cria um pagamento Transparente no Mercado Pago na conta do fotógrafo.
 *
 * POST body:
 *   { jobId, quantity, clientToken, method: 'pix' | 'card', card?: { ... } }
 *
 * Response PIX:
 *   { purchaseId, pixCode, pixQr, status }
 *
 * Response Card:
 *   { purchaseId, status }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const PLATFORM_FEE_PCT = 0.02

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization, x-client-info, apikey',
}

interface CardData {
  token: string        // card token gerado pelo frontend via MP Public Key
  holderName: string
  cpf: string          // somente dígitos
  installments: number
  paymentMethodId: string  // visa, master, elo, etc.
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS })

  try {
    const body = await req.json() as {
      jobId: string
      quantity: number
      clientToken: string
      method: 'pix' | 'card'
      card?: CardData
    }

    const { jobId, quantity, clientToken, method } = body

    if (!jobId || !quantity || !clientToken || !method) {
      throw new Error('Missing required fields')
    }
    if (quantity < 1 || quantity > 100) throw new Error('Quantidade inválida')
    if (method !== 'pix' && method !== 'card') throw new Error('Método de pagamento inválido')

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

    // Busca job + fotógrafo + token MP
    const { data: job, error: jobErr } = await supabase
      .from('jobs')
      .select('id, title, extra_photo_enabled, extra_photo_price, photographer_id, photographers(id, mp_access_token, mp_user_id)')
      .eq('id', jobId)
      .single()

    if (jobErr || !job) throw new Error('Job não encontrado')
    if (!job.extra_photo_enabled) throw new Error('Fotos extras não habilitadas neste trabalho')
    if (!job.extra_photo_price || job.extra_photo_price <= 0) throw new Error('Preço por foto não configurado')

    const photographer = job.photographers as unknown as { id: string; mp_access_token: string | null; mp_user_id: string | null }
    if (!photographer?.mp_access_token) throw new Error('Fotógrafo não conectou o Mercado Pago')

    const unitPrice   = Number(job.extra_photo_price)
    const totalAmount = Math.round(unitPrice * quantity * 100) / 100
    const platformFee = Math.round(totalAmount * PLATFORM_FEE_PCT * 100) / 100

    // Registra compra pending
    const { data: purchase, error: purchaseErr } = await supabase
      .from('extra_photo_purchases')
      .insert({
        job_id:          jobId,
        photographer_id: photographer.id,
        client_token:    clientToken,
        quantity,
        unit_price:      unitPrice,
        amount_paid:     totalAmount,
        platform_fee:    platformFee,
        status:          'pending',
      })
      .select('id')
      .single()

    if (purchaseErr || !purchase) throw new Error('Erro ao registrar compra')

    const accessToken = photographer.mp_access_token

    // ── PIX ──────────────────────────────────────────────────────────
    if (method === 'pix') {
      const pixBody = {
        transaction_amount: totalAmount,
        description:        `Fotos extras — ${job.title ?? 'Galeria'} (${quantity}x)`,
        payment_method_id:  'pix',
        external_reference: purchase.id,
        notification_url:   `${SUPABASE_URL}/functions/v1/mp-webhook`,
        payer: {
          email: 'cliente@galeria.com',  // email genérico para pagamento anônimo
        },
      }

      const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'X-Idempotency-Key': purchase.id,
        },
        body: JSON.stringify(pixBody),
      })

      if (!mpRes.ok) {
        const mpErr = await mpRes.text()
        console.error('[mp-create-payment] MP PIX error:', mpErr)
        throw new Error('Erro ao criar pagamento PIX')
      }

      const mpData = await mpRes.json() as {
        id: number
        status: string
        point_of_interaction?: {
          transaction_data?: {
            qr_code?: string
            qr_code_base64?: string
          }
        }
      }

      // Salva mp_payment_id na compra
      await supabase
        .from('extra_photo_purchases')
        .update({ mp_payment_id: String(mpData.id) })
        .eq('id', purchase.id)

      const txData = mpData.point_of_interaction?.transaction_data

      return new Response(JSON.stringify({
        purchaseId: purchase.id,
        status:     mpData.status,
        pixCode:    txData?.qr_code ?? null,
        pixQr:      txData?.qr_code_base64 ?? null,
      }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // ── CARTÃO DE CRÉDITO ─────────────────────────────────────────────
    // O frontend tokeniza o cartão via Public Key e envia apenas o token
    const card = body.card
    if (!card) throw new Error('Dados do cartão não fornecidos')
    if (!card.token) throw new Error('Token do cartão não fornecido')

    const cardPayBody = {
      transaction_amount: totalAmount,
      token:              card.token,
      description:        `Fotos extras — ${job.title ?? 'Galeria'} (${quantity}x)`,
      installments:       card.installments ?? 1,
      payment_method_id:  card.paymentMethodId,
      external_reference: purchase.id,
      notification_url:   `${SUPABASE_URL}/functions/v1/mp-webhook`,
      payer: {
        email:          'cliente@galeria.com',
        identification: {
          type:   'CPF',
          number: card.cpf,
        },
      },
    }

    const cardRes = await fetch('https://api.mercadopago.com/v1/payments', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'X-Idempotency-Key': purchase.id,
      },
      body: JSON.stringify(cardPayBody),
    })

    if (!cardRes.ok) {
      const cardErr = await cardRes.text()
      console.error('[mp-create-payment] Card payment error:', cardErr)
      throw new Error('Erro ao processar pagamento com cartão')
    }

    const cardData = await cardRes.json() as {
      id: number
      status: string
      status_detail: string
    }

    // Atualiza compra com payment_id e status
    const newStatus = cardData.status === 'approved' ? 'approved'
      : cardData.status === 'rejected' ? 'rejected'
      : 'pending'

    await supabase
      .from('extra_photo_purchases')
      .update({
        mp_payment_id: String(cardData.id),
        status:        newStatus,
        updated_at:    new Date().toISOString(),
      })
      .eq('id', purchase.id)

    // Se aprovado, incrementa limite do job (Cenário A — delivery)
    if (newStatus === 'approved') {
      const { count: deliveryCount } = await supabase
        .from('site_images')
        .select('id', { count: 'exact', head: true })
        .eq('job_id', jobId)
        .eq('upload_mode', 'delivery')

      if ((deliveryCount ?? 0) > 0) {
        const { data: currentJob } = await supabase
          .from('jobs')
          .select('gallery_selection_limit')
          .eq('id', jobId)
          .single()

        const newLimit = (currentJob?.gallery_selection_limit ?? 0) + quantity
        await supabase
          .from('jobs')
          .update({ gallery_selection_limit: newLimit })
          .eq('id', jobId)
      }
    }

    return new Response(JSON.stringify({
      purchaseId:    purchase.id,
      status:        cardData.status,
      statusDetail:  cardData.status_detail,
    }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[mp-create-payment]', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
