/**
 * Cloudflare Worker — fotux-process-variants
 *
 * Responsabilidades:
 *  1. Receber chamada do Supabase Edge Function após upload do master
 *  2. Baixar o master do R2 (binding direto — sem HTTP, sem custo de egress)
 *  3. Redimensionar via Cloudflare Image Resizing API (integrada ao Worker)
 *  4. Salvar variantes WebP de volta no R2
 *  5. Atualizar site_images no Supabase com as keys das variantes
 *
 * Payload esperado (POST /process):
 * {
 *   imageId:  string   — ID do registro em site_images
 *   masterKey: string  — key do master no R2
 *   mode: 'selection' | 'delivery'
 * }
 */

interface Env {
  FOTUX_BUCKET: R2Bucket
  SUPABASE_URL: string
  SUPABASE_SERVICE_KEY: string
  WORKER_SECRET: string
}

interface ProcessPayload {
  imageId: string
  masterKey: string
  mode: 'selection' | 'delivery'
}

// Variantes a gerar por modo
const VARIANTS: Record<'selection' | 'delivery', { suffix: string; width: number }[]> = {
  selection: [
    { suffix: '2048', width: 2048 },
  ],
  delivery: [
    { suffix: '2048', width: 2048 },
    { suffix: '1024', width: 1024 },
  ],
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Verificação do segredo compartilhado
    const authHeader = request.headers.get('X-Worker-Secret')
    if (authHeader !== env.WORKER_SECRET) {
      return new Response('Unauthorized', { status: 401 })
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    const url = new URL(request.url)
    if (url.pathname !== '/process') {
      return new Response('Not Found', { status: 404 })
    }

    let payload: ProcessPayload
    try {
      payload = await request.json() as ProcessPayload
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
    }

    const { imageId, masterKey, mode } = payload
    if (!imageId || !masterKey || !mode) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 })
    }

    try {
      // Marca como 'processing' antes de começar
      await updateSupabase(env, imageId, { variants_status: 'processing' })

      // Baixa o master diretamente do R2 via binding (sem egress)
      const masterObject = await env.FOTUX_BUCKET.get(masterKey)
      if (!masterObject) {
        throw new Error(`Master não encontrado no R2: ${masterKey}`)
      }

      const masterBuffer = await masterObject.arrayBuffer()
      const variants = VARIANTS[mode] ?? VARIANTS.selection
      const updates: Record<string, string> = {}

      for (const variant of variants) {
        const variantKey = buildVariantKey(masterKey, variant.suffix)

        // Resize via Cloudflare Image Resizing (fetch para URL interna do R2)
        // O Worker acessa o R2 com binding — usamos a URL de worker interna
        const resizedBuffer = await resizeImage(masterBuffer, variant.width)

        // Salva variante no R2
        await env.FOTUX_BUCKET.put(variantKey, resizedBuffer, {
          httpMetadata: { contentType: 'image/webp' },
        })

        updates[`variant_${variant.suffix}_key`] = variantKey
      }

      // Atualiza Supabase com as keys das variantes e status 'done'
      await updateSupabase(env, imageId, { ...updates, variants_status: 'done' })

      return new Response(JSON.stringify({ success: true, imageId, variants: Object.keys(updates) }), {
        headers: { 'Content-Type': 'application/json' },
      })

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[process-variants]', message)
      await updateSupabase(env, imageId, { variants_status: 'error' }).catch(() => {})
      return new Response(JSON.stringify({ error: message }), { status: 500 })
    }
  },
}

/**
 * Redimensiona imagem usando Cloudflare Image Resizing via fetch interno.
 *
 * O Cloudflare Image Resizing suporta Workers via cf.image options.
 * Referência: https://developers.cloudflare.com/images/image-resizing/resize-with-workers/
 */
async function resizeImage(buffer: ArrayBuffer, targetWidth: number): Promise<ArrayBuffer> {
  // Cria um blob da imagem original
  const blob = new Blob([buffer])
  const objectUrl = URL.createObjectURL(blob)

  // Usa a API de Image Resizing do Cloudflare via fetch com cf options
  const response = await fetch(objectUrl, {
    cf: {
      image: {
        width: targetWidth,
        format: 'webp',
        quality: 85,
        fit: 'scale-down', // nunca ampliar, só reduzir
      },
    },
  } as RequestInit & { cf: { image: Record<string, unknown> } })

  if (!response.ok) {
    throw new Error(`Resize falhou (${targetWidth}px): ${response.statusText}`)
  }

  return response.arrayBuffer()
}

/**
 * Constrói a key da variante a partir da key do master.
 * master:  {photographer_id}/selection/1234567890-foto.jpg
 * variante: {photographer_id}/selection/variants/1234567890-foto_2048.webp
 */
function buildVariantKey(masterKey: string, suffix: string): string {
  const lastSlash = masterKey.lastIndexOf('/')
  const dir = masterKey.substring(0, lastSlash)
  const filename = masterKey.substring(lastSlash + 1)
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '')
  return `${dir}/variants/${nameWithoutExt}_${suffix}.webp`
}

/**
 * Atualiza o registro site_images no Supabase via REST API.
 * Usa service key para contornar RLS (o Worker não tem sessão de usuário).
 */
async function updateSupabase(
  env: Env,
  imageId: string,
  patch: Record<string, string>
): Promise<void> {
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/site_images?id=eq.${imageId}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(patch),
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Supabase update falhou: ${text}`)
  }
}
