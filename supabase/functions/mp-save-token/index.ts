/**
 * Edge Function — mp-save-token
 *
 * Valida o Access Token do Mercado Pago consultando a API do MP
 * e salva no banco junto com a Public Key (se fornecida).
 *
 * POST body: { photographerId: string, accessToken: string, publicKey?: string }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS })

  try {
    const body = await req.json() as {
      photographerId: string
      accessToken: string
      publicKey?: string
    }

    const { photographerId, accessToken } = body
    const providedPublicKey = body.publicKey?.trim() || null

    if (!photographerId || !accessToken) {
      return new Response(JSON.stringify({ error: 'Dados incompletos' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // Valida o token na API do MP
    const mpRes = await fetch('https://api.mercadopago.com/users/me', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })

    if (!mpRes.ok) {
      return new Response(JSON.stringify({ error: 'Access Token inválido ou não aceito pelo Mercado Pago.' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const mpUser = await mpRes.json() as { id: number; nickname: string }

    // Salva no banco via service role (sem RLS)
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
    const updateData: Record<string, string> = {
      mp_access_token: accessToken,
      mp_user_id:      String(mpUser.id),
      mp_connected_at: new Date().toISOString(),
    }
    if (providedPublicKey) updateData.mp_public_key = providedPublicKey

    const { error } = await supabase
      .from('photographers')
      .update(updateData)
      .eq('id', photographerId)

    if (error) {
      console.error('[mp-save-token] DB error:', error.message)
      return new Response(JSON.stringify({ error: 'Erro ao salvar no banco.' }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({
      success:  true,
      mpUserId: mpUser.id,
      nickname: mpUser.nickname,
    }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[mp-save-token]', err)
    return new Response(JSON.stringify({ error: 'Erro interno' }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
