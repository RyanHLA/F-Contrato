import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Edge Function: lifecycle-jobs
 *
 * Roda jobs periódicos do ciclo de vida das contas.
 * Chamada via Supabase Scheduled Functions ou cron externo (ex: GitHub Actions).
 *
 * Jobs disponíveis (enviados no body como { job: "nome" }):
 *   expire_trials          → suspende trials vencidos
 *   send_retention_emails  → envia e-mails escalonados durante a janela de 30 dias
 *   delete_expired_accounts → deleta dados de contas após 30 dias suspensos
 *
 * Variáveis de ambiente necessárias:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   RESEND_API_KEY          (provedor de e-mail transacional)
 *   APP_URL                 (URL base do painel, ex: https://app.seudominio.com.br)
 *   LIFECYCLE_SECRET        (segredo para autorizar chamadas externas)
 */

const LIFECYCLE_SECRET = Deno.env.get("LIFECYCLE_SECRET") ?? "";
const RESEND_API_KEY   = Deno.env.get("RESEND_API_KEY") ?? "";
const APP_URL          = Deno.env.get("APP_URL") ?? "https://app.example.com";
const FROM_EMAIL       = Deno.env.get("RESEND_FROM_EMAIL") ?? "noreply@fotux.com.br";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!RESEND_API_KEY) {
    console.warn(`[email] RESEND_API_KEY não configurado — e-mail para ${to} não enviado`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend error (${res.status}): ${text}`);
  }
}

function billingUrl(reason: string) {
  return `${APP_URL}/billing?reason=${reason}`;
}

// ---------------------------------------------------------------------------
// Job 1: expire_trials
// ---------------------------------------------------------------------------

async function expireTrials(): Promise<{ expired: number }> {
  const { error } = await supabase.rpc("expire_trials");
  if (error) throw error;
  // expire_trials() retorna INTEGER com a contagem — capturamos via data se necessário
  const { data } = await supabase.rpc("expire_trials");
  return { expired: data ?? 0 };
}

// ---------------------------------------------------------------------------
// Job 2: send_retention_emails
// ---------------------------------------------------------------------------

const EMAIL_TEMPLATES: Record<string, (name: string, daysRemaining: number) => { subject: string; html: string }> = {
  suspension_day1: (name) => ({
    subject: "Seu acesso foi suspenso — seus arquivos estão seguros por 30 dias",
    html: `
      <h2>Olá, ${name}</h2>
      <p>Seu período de acesso encerrou. <strong>Seus álbuns e fotos estão seguros por 30 dias.</strong></p>
      <p>Durante esse período, seu acesso ao painel está suspenso.</p>
      <p>Para reativar sua conta e recuperar o acesso completo imediatamente, assine um plano:</p>
      <p><a href="${billingUrl("suspended")}">Reativar minha conta</a></p>
    `,
  }),
  suspension_day15: (name, daysRemaining) => ({
    subject: `Atenção: faltam ${daysRemaining} dias para a deleção permanente dos seus álbuns`,
    html: `
      <h2>Olá, ${name}</h2>
      <p><strong>Atenção:</strong> seus arquivos serão deletados permanentemente em ${daysRemaining} dias.</p>
      <p>Reative sua assinatura agora para preservar todos os seus álbuns e fotos:</p>
      <p><a href="${billingUrl("suspended")}">Reativar minha conta</a></p>
    `,
  }),
  suspension_day27: (name, daysRemaining) => ({
    subject: `⚠️ Ação requerida: seus arquivos serão apagados em ${daysRemaining} dias`,
    html: `
      <h2>Olá, ${name}</h2>
      <p>Este é um aviso crítico. <strong>Seus arquivos serão permanentemente apagados em ${daysRemaining} dias.</strong></p>
      <p>Esta operação não pode ser desfeita.</p>
      <p><a href="${billingUrl("suspended")}">Reativar minha conta agora</a></p>
    `,
  }),
  deletion_day30: (name) => ({
    subject: "Sua conta foi limpa — esperamos ver você de volta",
    html: `
      <h2>Olá, ${name}</h2>
      <p>Conforme avisado, seus dados foram removidos dos nossos servidores para liberar espaço.</p>
      <p>Se quiser começar novamente, você pode criar uma nova conta a qualquer momento.</p>
      <p>Esperamos ver você de volta em breve!</p>
    `,
  }),
};

async function sendRetentionEmails(): Promise<{ sent: number; errors: number }> {
  let sent = 0;
  let errors = 0;

  for (const emailType of Object.keys(EMAIL_TEMPLATES)) {
    const { data: targets, error } = await supabase
      .rpc("get_retention_email_targets", { p_email_type: emailType });

    if (error) {
      console.error(`[lifecycle] get_retention_email_targets(${emailType}):`, error.message);
      continue;
    }

    for (const target of targets ?? []) {
      try {
        const { subject, html } = EMAIL_TEMPLATES[emailType](target.name, target.days_remaining);
        await sendEmail(target.email, subject, html);

        // Registra envio para garantir idempotência
        await supabase.from("email_log").insert({
          photographer_id: target.photographer_id,
          email_type:      emailType,
        });

        sent++;
        console.log(`[lifecycle] E-mail '${emailType}' enviado para ${target.email}`);
      } catch (err) {
        errors++;
        console.error(`[lifecycle] Falha ao enviar '${emailType}' para ${target.email}:`, err.message);
      }
    }
  }

  return { sent, errors };
}

// ---------------------------------------------------------------------------
// Job 3: delete_expired_accounts
// ---------------------------------------------------------------------------

async function deleteExpiredAccounts(): Promise<{ deleted: number; errors: number }> {
  const { data: expired, error } = await supabase
    .from("photographers")
    .select("id, email, name")
    .lte("data_deletion_scheduled_at", new Date().toISOString())
    .eq("account_status", "suspended");

  if (error) throw error;
  if (!expired?.length) return { deleted: 0, errors: 0 };

  let deleted = 0;
  let errors  = 0;

  for (const photographer of expired) {
    try {
      // Arquiva registro mínimo antes de deletar (fins legais/fiscais)
      await supabase.from("email_log")
        .delete()
        .eq("photographer_id", photographer.id);
        // email_log tem ON DELETE CASCADE, mas limpamos aqui explicitamente

      // Deleta o fotógrafo — ON DELETE CASCADE cuida de albums, site_images, audit_log
      // Objetos no R2 são deletados pela Edge Function delete-expired-r2-objects
      // (ou via script separado — R2 não tem FK com Postgres)
      const { error: delErr } = await supabase
        .from("photographers")
        .delete()
        .eq("id", photographer.id);

      if (delErr) throw delErr;

      deleted++;
      console.log(`[lifecycle] Conta deletada: ${photographer.email} (${photographer.id})`);
    } catch (err) {
      errors++;
      console.error(`[lifecycle] Falha ao deletar ${photographer.email}:`, err.message);
    }
  }

  return { deleted, errors };
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200 });
  }

  // Verifica segredo de autorização (chamadas externas via cron/GitHub Actions)
  const secret = req.headers.get("x-lifecycle-secret") ?? "";
  if (LIFECYCLE_SECRET && secret !== LIFECYCLE_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: { job?: string } = {};
  try {
    body = await req.json();
  } catch { /* body vazio = roda todos os jobs */ }

  const job = body.job;
  const results: Record<string, unknown> = {};

  try {
    if (!job || job === "expire_trials") {
      results.expire_trials = await expireTrials();
    }
    if (!job || job === "send_retention_emails") {
      results.send_retention_emails = await sendRetentionEmails();
    }
    if (!job || job === "delete_expired_accounts") {
      results.delete_expired_accounts = await deleteExpiredAccounts();
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[lifecycle-jobs] Erro:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
