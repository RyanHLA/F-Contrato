/**
 * Edge Function pública — sign-gallery-url
 *
 * POST body: { jobId: string, keys: string[], forDownload?: boolean, filename?: string }
 * Response:  { urls: { [key]: signedUrl } }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { S3Client, GetObjectCommand } from "npm:@aws-sdk/client-s3@3.450.0"
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3.450.0"
import { createClient } from "npm:@supabase/supabase-js@2"

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization, x-client-info, apikey',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body = await req.json() as {
      jobId: string
      keys: string[]
      forDownload?: boolean
      filename?: string
    }
    const { jobId, keys, forDownload = false, filename = 'foto' } = body

    if (!jobId || !Array.isArray(keys) || keys.length === 0) {
      throw new Error('Missing required fields: jobId, keys')
    }

    // Valida que o job existe
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const { data: job, error: jobErr } = await supabase
      .from('jobs')
      .select('id')
      .eq('id', jobId)
      .single()

    if (jobErr || !job) throw new Error('Job não encontrado')

    const s3 = new S3Client({
      region: 'auto',
      endpoint: Deno.env.get('R2_ENDPOINT'),
      credentials: {
        accessKeyId:     Deno.env.get('R2_ACCESS_KEY_ID')!,
        secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')!,
      },
    })
    const bucket = Deno.env.get('R2_BUCKET_NAME')!

    const urls: Record<string, string> = {}
    await Promise.all(
      keys.map(async (key) => {
        try {
          const cmd = new GetObjectCommand({
            Bucket: bucket,
            Key: key,
            // forDownload = true força o browser a baixar em vez de abrir
            ...(forDownload
              ? { ResponseContentDisposition: `attachment; filename="${filename}"` }
              : {}),
          })
          urls[key] = await getSignedUrl(s3, cmd, {
            expiresIn: forDownload ? 300 : 7200,
          })
        } catch {
          urls[key] = ''
        }
      })
    )

    return new Response(JSON.stringify({ urls }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' }
    })
  }
})
