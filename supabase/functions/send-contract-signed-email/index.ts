import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const RESEND_API_KEY  = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM_EMAIL      = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev'
const ALLOWED_ORIGIN  = Deno.env.get('ADMIN_ORIGIN') ?? 'http://localhost:8081'

const getCorsHeaders = (origin: string) => ({
  'Access-Control-Allow-Origin': origin || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
})

serve(async (req) => {
  const origin = req.headers.get('origin') ?? ''
  const cors   = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  try {
    // Aceita chamadas tanto com JWT (admin) quanto sem (SECURITY DEFINER via service_role)
    // Quando chamada por trigger/função interna usa SUPABASE_SERVICE_ROLE_KEY
    const authHeader = req.headers.get('Authorization')

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const body = await req.json()
    const { contract_id, job_id } = body

    if (!contract_id && !job_id) {
      throw new Error('Missing contract_id or job_id')
    }

    // Busca dados do contrato + fotógrafo + job
    const query = supabaseAdmin
      .from('contracts')
      .select(`
        id,
        signed_at,
        client_name,
        client_doc,
        client_email,
        document_hash,
        photographer_id,
        photographers!inner (
          name,
          email,
          slug,
          auto_countersign
        ),
        jobs!inner (
          id,
          title,
          event_date,
          event_type
        )
      `)

    const { data: contract, error } = contract_id
      ? await query.eq('id', contract_id).single()
      : await query.eq('job_id', job_id).single()

    if (error || !contract) throw new Error('Contract not found')

    const photographer = (contract as any).photographers
    const job          = (contract as any).jobs

    const photographerEmail = photographer?.email
    if (!photographerEmail) throw new Error('Photographer email not found')

    const signedAt = contract.signed_at
      ? new Date(contract.signed_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      : '—'

    const contractUrl = `${Deno.env.get('ADMIN_ORIGIN') ?? 'http://localhost:8081'}/admin`

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Inter,Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

    <div style="background:#111;padding:24px 32px;">
      <p style="color:#fff;font-size:18px;font-weight:700;margin:0;">${photographer.name}</p>
      <p style="color:#9ca3af;font-size:13px;margin:4px 0 0;">Notificação de Contrato</p>
    </div>

    <div style="padding:32px;">
      <h2 style="font-size:20px;font-weight:700;color:#111;margin:0 0 8px;">
        ✅ Contrato assinado pelo cliente
      </h2>
      <p style="color:#374151;font-size:15px;margin:0 0 24px;">
        O seu cliente assinou o contrato. Verifique os detalhes abaixo.
      </p>

      <!-- Card de dados -->
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin-bottom:24px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="color:#6b7280;font-size:13px;padding:6px 0;width:40%;">Contrato</td>
            <td style="color:#111;font-size:13px;font-weight:600;padding:6px 0;">${job?.title ?? '—'}</td>
          </tr>
          ${job?.event_type ? `<tr>
            <td style="color:#6b7280;font-size:13px;padding:6px 0;">Tipo</td>
            <td style="color:#111;font-size:13px;padding:6px 0;">${job.event_type}</td>
          </tr>` : ''}
          ${job?.event_date ? `<tr>
            <td style="color:#6b7280;font-size:13px;padding:6px 0;">Data do evento</td>
            <td style="color:#111;font-size:13px;padding:6px 0;">${new Date(job.event_date).toLocaleDateString('pt-BR')}</td>
          </tr>` : ''}
          <tr><td colspan="2" style="border-top:1px solid #e2e8f0;padding:0;"></td></tr>
          <tr>
            <td style="color:#6b7280;font-size:13px;padding:6px 0;">Cliente</td>
            <td style="color:#111;font-size:13px;font-weight:600;padding:6px 0;">${contract.client_name ?? '—'}</td>
          </tr>
          ${contract.client_doc ? `<tr>
            <td style="color:#6b7280;font-size:13px;padding:6px 0;">CPF/CNPJ</td>
            <td style="color:#111;font-size:13px;padding:6px 0;">${contract.client_doc}</td>
          </tr>` : ''}
          ${contract.client_email ? `<tr>
            <td style="color:#6b7280;font-size:13px;padding:6px 0;">E-mail</td>
            <td style="color:#111;font-size:13px;padding:6px 0;">${contract.client_email}</td>
          </tr>` : ''}
          <tr><td colspan="2" style="border-top:1px solid #e2e8f0;padding:0;"></td></tr>
          <tr>
            <td style="color:#6b7280;font-size:13px;padding:6px 0;">Assinado em</td>
            <td style="color:#111;font-size:13px;padding:6px 0;">${signedAt} (BRT)</td>
          </tr>
          ${contract.document_hash ? `<tr>
            <td style="color:#6b7280;font-size:13px;padding:6px 0;vertical-align:top;">Hash SHA-256</td>
            <td style="color:#6b7280;font-size:10px;font-family:monospace;padding:6px 0;word-break:break-all;">${contract.document_hash}</td>
          </tr>` : ''}
        </table>
      </div>

      ${photographer.auto_countersign
        ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 18px;margin-bottom:24px;">
            <p style="color:#15803d;font-size:13px;font-weight:600;margin:0 0 4px;">Contra-assinatura automática ativada</p>
            <p style="color:#166534;font-size:12px;margin:0;">O contrato foi contra-assinado automaticamente. Nenhuma ação necessária.</p>
          </div>`
        : `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 18px;margin-bottom:24px;">
            <p style="color:#92400e;font-size:13px;font-weight:600;margin:0 0 4px;">Contra-assinatura pendente</p>
            <p style="color:#92400e;font-size:12px;margin:0 0 12px;">Acesse o painel para contra-assinar o contrato e finalizar o processo.</p>
            <a href="${contractUrl}" style="display:inline-block;background:#111;color:#fff;font-weight:700;font-size:13px;text-decoration:none;padding:10px 22px;border-radius:6px;">
              Acessar painel
            </a>
          </div>`
      }

      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
      <p style="color:#9ca3af;font-size:11px;margin:0;">
        Este e-mail foi gerado automaticamente pelo sistema de contratos digitais.
        A assinatura eletrônica tem validade jurídica plena conforme a Lei nº 14.063/2020.
      </p>
    </div>
  </div>
</body>
</html>`

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${photographer.name} <${FROM_EMAIL}>`,
        to:   [photographerEmail],
        subject: `✅ Contrato assinado — ${job?.title ?? 'Contrato'}`,
        html,
      }),
    })

    if (!resendRes.ok) {
      const err = await resendRes.text()
      throw new Error(`Resend error: ${err}`)
    }

    const resendData = await resendRes.json()
    return new Response(JSON.stringify({ success: true, id: resendData.id }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })

  } catch (err: any) {
    console.error('[send-contract-signed-email]', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
