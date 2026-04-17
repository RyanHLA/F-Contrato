/**
 * Supabase Edge Function — trigger-variants
 *
 * Chamada via Database Webhook no evento INSERT em site_images.
 * Dispara o Cloudflare Worker process-variants de forma assíncrona
 * para que o upload não bloqueie a resposta ao frontend.
 *
 * Configurar no Supabase Dashboard:
 *   Database > Webhooks > New Webhook
 *   Table: site_images | Event: INSERT
 *   URL: https://<project>.supabase.co/functions/v1/trigger-variants
 *   HTTP method: POST
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const WORKER_URL    = Deno.env.get('PROCESS_VARIANTS_WORKER_URL') ?? ''
const WORKER_SECRET = Deno.env.get('WORKER_SECRET') ?? ''

serve(async (req) => {
  try {
    const payload = await req.json()

    // O webhook do Supabase envia { type, table, schema, record, old_record }
    const record = payload?.record
    if (!record) {
      return new Response('No record', { status: 200 })
    }

    const { id, r2_key, upload_mode } = record

    // Só processa fotos de seleção e entrega (ignora capas e marcas d'água)
    if (!r2_key || (upload_mode !== 'selection' && upload_mode !== 'delivery')) {
      return new Response('Skipped', { status: 200 })
    }

    if (!WORKER_URL || !WORKER_SECRET) {
      console.error('[trigger-variants] WORKER_URL ou WORKER_SECRET não configurados')
      return new Response('Worker not configured', { status: 200 })
    }

    // Disparo assíncrono — não aguarda a resposta do Worker
    // O Worker vai atualizar variants_status diretamente no Supabase
    const workerPromise = fetch(`${WORKER_URL}/process`, {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'X-Worker-Secret': WORKER_SECRET,
      },
      body: JSON.stringify({
        imageId:   id,
        masterKey: r2_key,
        mode:      upload_mode,
      }),
    }).catch((err) => {
      console.error('[trigger-variants] Worker call failed:', err.message)
    })

    // waitUntil garante que o fetch não seja cancelado quando a função retorna
    // @ts-ignore — globalThis.EdgeRuntime existe no ambiente Supabase
    if (typeof EdgeRuntime !== 'undefined') {
      // @ts-ignore
      EdgeRuntime.waitUntil(workerPromise)
    }

    return new Response(JSON.stringify({ queued: true, imageId: id }), {
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[trigger-variants]', err)
    return new Response('Internal error', { status: 500 })
  }
})
