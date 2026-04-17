import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "npm:@aws-sdk/client-s3@3.450.0"
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3.450.0"
import { createClient } from "npm:@supabase/supabase-js@2"

const ALLOWED_ORIGIN = Deno.env.get('ADMIN_ORIGIN') ?? 'http://localhost:8081'

const getCorsHeaders = (requestOrigin: string) => ({
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN && requestOrigin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : '',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
})

// 100 MB — suporta RAW e HEIC de câmeras profissionais
const MAX_FILE_SIZE = 100 * 1024 * 1024

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/tiff',
]

// Modos válidos de upload
type UploadMode = 'selection' | 'delivery' | 'covers' | 'watermarks' | 'logos'

const VALID_MODES: UploadMode[] = ['selection', 'delivery', 'covers', 'watermarks', 'logos']

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/\.{2,}/g, '-')
}

function buildKey(photographerId: string, mode: UploadMode, filename: string): string {
  const ts = Date.now()
  const safe = sanitizeFilename(filename)
  return `${photographerId}/${mode}/${ts}-${safe}`
}

serve(async (req) => {
  const origin = req.headers.get('origin') ?? ''
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('Unauthorized')

    const { data: photographer, error: pgErr } = await supabase
      .from('photographers')
      .select('id, account_status, trial_ends_at')
      .eq('user_id', user.id)
      .single()

    if (pgErr || !photographer) throw new Error('Photographer not found')

    if (photographer.account_status === 'suspended') {
      throw new Error('ACCOUNT_SUSPENDED: Reative sua assinatura para continuar.')
    }
    if (
      photographer.account_status === 'trial' &&
      new Date(photographer.trial_ends_at) < new Date()
    ) {
      throw new Error('TRIAL_EXPIRED: Seu período de teste encerrou.')
    }

    const body = await req.json()
    const { action } = body

    // S3 client aponta para bucket PRIVADO (sem R2_PUBLIC_URL para leitura direta)
    const s3 = new S3Client({
      region: 'auto',
      endpoint: Deno.env.get('R2_ENDPOINT'),
      credentials: {
        accessKeyId:     Deno.env.get('R2_ACCESS_KEY_ID')!,
        secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')!,
      },
    })
    const bucketName = Deno.env.get('R2_BUCKET_NAME')!

    // ── UPLOAD ──────────────────────────────────────────────────────────
    if (action === 'upload') {
      const { fileType, fileSize, filename, mode, imageId, jobId } = body

      if (!fileType || !ALLOWED_MIME_TYPES.includes(fileType.toLowerCase())) {
        throw new Error(`Tipo de arquivo não permitido: ${fileType}`)
      }
      if (fileSize && fileSize > MAX_FILE_SIZE) {
        throw new Error(`Arquivo muito grande. Limite: ${MAX_FILE_SIZE / (1024 * 1024)}MB.`)
      }
      if (!filename) throw new Error('Missing required field: filename')

      const uploadMode: UploadMode = VALID_MODES.includes(mode) ? mode : 'selection'

      // Verifica quota apenas para fotos (não capa/marca d'água)
      if (uploadMode === 'selection' || uploadMode === 'delivery') {
        const { error: quotaErr } = await supabase.rpc('check_storage_quota', {
          p_photographer_id: photographer.id,
          p_file_size_bytes: fileSize ?? 0,
        })
        if (quotaErr) throw new Error(quotaErr.message)
      }

      const key = buildKey(photographer.id, uploadMode, filename)

      // Presigned URL para PUT (bucket privado — o browser faz PUT direto no R2)
      const putCommand = new PutObjectCommand({
        Bucket:      bucketName,
        Key:         key,
        ContentType: fileType,
        // Sem CacheControl público — bucket privado, acesso via signed URL
      })
      // PUT expira em 10 min (arquivos grandes podem demorar mais)
      const uploadUrl = await getSignedUrl(s3, putCommand, { expiresIn: 600 })

      // A "URL pública" agora não existe — armazenamos apenas a key
      // A leitura é feita via presigned GET sob demanda
      return new Response(JSON.stringify({ uploadUrl, key }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── GET SIGNED READ URL (single) ────────────────────────────────────
    if (action === 'sign') {
      const { key, expiresIn = 3600 } = body
      if (!key) throw new Error('Missing required field: key')
      if (!key.startsWith(`${photographer.id}/`)) throw new Error('Forbidden')

      const { GetObjectCommand } = await import("npm:@aws-sdk/client-s3@3.450.0")
      const getCmd = new GetObjectCommand({ Bucket: bucketName, Key: key })
      const signedUrl = await getSignedUrl(s3, getCmd, { expiresIn })

      return new Response(JSON.stringify({ url: signedUrl }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── GET SIGNED READ URLs (batch) ─────────────────────────────────────
    if (action === 'sign-batch') {
      const { keys, expiresIn = 3600 } = body
      if (!Array.isArray(keys) || keys.length === 0) throw new Error('Missing required field: keys')

      // Valida que todas as keys pertencem ao fotógrafo
      for (const k of keys) {
        if (!k.startsWith(`${photographer.id}/`)) throw new Error(`Forbidden key: ${k}`)
      }

      const { GetObjectCommand } = await import("npm:@aws-sdk/client-s3@3.450.0")
      const urls: Record<string, string> = {}
      await Promise.all(keys.map(async (k: string) => {
        const cmd = new GetObjectCommand({ Bucket: bucketName, Key: k })
        urls[k] = await getSignedUrl(s3, cmd, { expiresIn })
      }))

      return new Response(JSON.stringify({ urls }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── DELETE ───────────────────────────────────────────────────────────
    if (action === 'delete') {
      const { key } = body
      if (!key) throw new Error('Missing required field: key')

      if (!key.startsWith(`${photographer.id}/`)) {
        console.error(`[FORBIDDEN] ${user.email} tentou deletar key de outro fotógrafo: ${key}`)
        throw new Error('Forbidden: Cannot delete another photographer\'s files.')
      }

      await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }))

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    throw new Error('Invalid action')

  } catch (error) {
    console.error('[upload-url2]', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' }
    })
  }
})
