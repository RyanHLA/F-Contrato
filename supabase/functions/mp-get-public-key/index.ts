/**
 * Edge Function — mp-get-public-key
 *
 * Retorna a Public Key do MP do fotógrafo dono do job.
 * Seguro expor — a Public Key é pública por design.
 *
 * GET /mp-get-public-key?jobId=xxx
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization, x-client-info, apikey',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const url = new URL(req.url)
  const jobId = url.searchParams.get('jobId')

  if (!jobId) {
    return new Response(JSON.stringify({ error: 'jobId obrigatório' }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

    const { data: job } = await supabase
      .from('jobs')
      .select('photographer_id, photographers(mp_public_key, mp_access_token)')
      .eq('id', jobId)
      .single()

    if (!job) {
      return new Response(JSON.stringify({ error: 'Job não encontrado' }), {
        status: 404,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const photographer = job.photographers as unknown as {
      mp_public_key: string | null
      mp_access_token: string | null
    }

    let publicKey = photographer?.mp_public_key ?? null

    // Se não tiver public key salva, tenta buscar via API do MP com o access token
    if (!publicKey && photographer?.mp_access_token) {
      try {
        const credRes = await fetch('https://api.mercadopago.com/v1/account/credentials', {
          headers: { 'Authorization': `Bearer ${photographer.mp_access_token}` },
        })
        if (credRes.ok) {
          const credData = await credRes.json() as { public_key?: string }
          publicKey = credData.public_key ?? null

          // Salva para a próxima vez
          if (publicKey) {
            await supabase
              .from('photographers')
              .update({ mp_public_key: publicKey })
              .eq('id', job.photographer_id)
          }
        }
      } catch {
        console.warn('[mp-get-public-key] Não foi possível buscar public key via API')
      }
    }

    if (!publicKey) {
      return new Response(JSON.stringify({ error: 'Public Key não encontrada. Reconecte o Mercado Pago nas configurações.' }), {
        status: 404,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ publicKey }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[mp-get-public-key]', err)
    return new Response(JSON.stringify({ error: 'Erro interno' }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
