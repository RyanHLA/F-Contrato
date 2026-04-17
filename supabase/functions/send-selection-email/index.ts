import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev'
const ALLOWED_ORIGIN = Deno.env.get('ADMIN_ORIGIN') ?? 'http://localhost:8081'

const getCorsHeaders = (requestOrigin: string) => ({
  'Access-Control-Allow-Origin': requestOrigin || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
})

serve(async (req) => {
  const origin = req.headers.get('origin') ?? ''
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Valida JWT do usuário
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Unauthorized')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) throw new Error('Unauthorized')

    // Busca fotógrafo
    const { data: photographer } = await supabase
      .from('photographers')
      .select('id, name, slug')
      .eq('user_id', user.id)
      .single()
    if (!photographer) throw new Error('Photographer not found')

    const body = await req.json()
    const { to_email, to_name, subject, message, gallery_url, client_pin, no_password } = body

    if (!to_email || !subject || !gallery_url) {
      throw new Error('Missing required fields: to_email, subject, gallery_url')
    }

    // Monta HTML do e-mail
    const pinBlock = !no_password && client_pin ? `
      <div style="margin: 24px 0; padding: 16px; background: #eff6ff; border: 1px solid #dbeafe; border-radius: 8px;">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
          <span style="color: #6b7280; font-size: 14px; width: 60px;">E-mail:</span>
          <span style="color: #2563eb; font-weight: 600; font-size: 14px;">${to_email}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="color: #6b7280; font-size: 14px; width: 60px;">Senha:</span>
          <span style="color: #2563eb; font-weight: 600; font-size: 14px; letter-spacing: 4px;">${client_pin}</span>
        </div>
      </div>
    ` : ''

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Inter,Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
    <div style="background:#111;padding:24px 32px;">
      <p style="color:#fff;font-size:18px;font-weight:700;margin:0;">${photographer.name}</p>
    </div>
    <div style="padding:32px;">
      <h2 style="font-size:22px;font-weight:700;color:#111;margin:0 0 16px;">${subject}</h2>
      <p style="color:#374151;font-size:15px;margin:0 0 8px;">Olá ${to_name || to_email}! Tudo bem?</p>
      <p style="color:#374151;font-size:15px;margin:16px 0;">${message.replace(/\n/g, '<br>')}</p>
      ${pinBlock}
      <div style="margin:28px 0;">
        <a href="${gallery_url}" style="display:inline-block;background:#C65D3B;color:#fff;font-weight:700;font-size:14px;text-decoration:none;padding:14px 32px;border-radius:6px;letter-spacing:0.5px;">VER FOTOS</a>
      </div>
      ${!no_password ? `<p style="color:#f59e0b;font-size:12px;font-style:italic;margin:16px 0 0;">* Não compartilhe esse e-mail caso queira manter a seleção das suas fotos em segurança.</p>` : ''}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
      <p style="color:#6b7280;font-size:13px;margin:0 0 4px;">Por favor, confirme o recebimento deste e-mail.</p>
      <p style="color:#6b7280;font-size:13px;margin:0 0 4px;">Um abraço,</p>
      <p style="color:#111;font-size:13px;font-weight:700;margin:0;">${photographer.name}</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
      <p style="color:#9ca3af;font-size:11px;margin:0 0 4px;">Caso tenha algum problema com o botão acima, copie e cole o link abaixo no navegador:</p>
      <a href="${gallery_url}" style="color:#60a5fa;font-size:11px;word-break:break-all;">${gallery_url}</a>
    </div>
  </div>
</body>
</html>`

    // Envia via Resend
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${photographer.name} <${FROM_EMAIL}>`,
        to: [to_email],
        subject,
        html,
      }),
    })

    if (!resendRes.ok) {
      const err = await resendRes.text()
      throw new Error(`Resend error: ${err}`)
    }

    const resendData = await resendRes.json()

    return new Response(JSON.stringify({ success: true, id: resendData.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err: any) {
    console.error('[send-selection-email]', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
