/**
 * Cloudflare Worker — fotux-zip-gallery
 *
 * Faz streaming de um ZIP com as fotos de entrega de um job diretamente
 * do R2 para o browser do cliente, sem armazenar o ZIP em disco.
 *
 * POST /zip
 * Body: { jobId: string, size: 'original' | '2048' | '1024' }
 *
 * Fluxo:
 *  1. Valida que download está habilitado para o tamanho pedido
 *  2. Busca lista de fotos de entrega do job via Supabase
 *  3. Para cada foto: lê do R2 via binding (sem egress) e escreve no ZIP
 *  4. Faz streaming do ZIP para o cliente conforme vai gerando
 */


interface Env {
  FOTUX_BUCKET: R2Bucket
  SUPABASE_URL: string
  SUPABASE_SERVICE_KEY: string
}

type DownloadSize = 'original' | '2048' | '1024'

interface JobRow {
  id: string
  title: string
  download_enabled: boolean
  download_high_res: string | null  // JSON: e.g. '["original","3600"]'
  download_web_size: string | null  // JSON: e.g. '["2048","1024","640"]'
}

interface PhotoRow {
  id: string
  title: string | null
  r2_key: string | null
  variant_2048_key: string | null
  variant_1024_key: string | null
  upload_mode: string
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS })
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: CORS })
    }

    const url = new URL(request.url)
    if (url.pathname !== '/zip') {
      return new Response('Not Found', { status: 404, headers: CORS })
    }

    let jobId: string
    let size: DownloadSize

    try {
      const body = await request.json() as { jobId: string; size: DownloadSize }
      jobId = body.jobId
      size  = body.size
      if (!jobId || !size) throw new Error('Missing fields')
    } catch {
      return new Response(JSON.stringify({ error: 'Body inválido. Esperado: { jobId, size }' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // 1. Busca metadados do job
    const job = await fetchJob(env, jobId)
    if (!job) {
      return new Response(JSON.stringify({ error: 'Job não encontrado' }), {
        status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    if (!job.download_enabled) {
      return new Response(JSON.stringify({ error: 'Download não habilitado para este trabalho' }), {
        status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // 2. Valida se o tamanho pedido está habilitado pelo fotógrafo
    if (!isSizeAllowed(job, size)) {
      return new Response(JSON.stringify({ error: `Tamanho "${size}" não disponível para download` }), {
        status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // 3. Busca fotos de entrega do job
    const photos = await fetchDeliveryPhotos(env, jobId)
    if (photos.length === 0) {
      return new Response(JSON.stringify({ error: 'Nenhuma foto de entrega encontrada' }), {
        status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // 4. Monta nome do arquivo ZIP
    const safeTitle = (job.title ?? 'galeria').replace(/[^a-zA-Z0-9\-_\u00C0-\u024F ]/g, '').trim()
    const sizeLabel = size === 'original' ? 'Original' : size === '2048' ? '2048px' : '1024px'
    const zipFilename = `${safeTitle} - ${sizeLabel}.zip`

    // 5. Streaming ZIP via TransformStream
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
    const writer = writable.getWriter()

    // Processa em background — não bloqueia o Response
    streamZip(env, photos, size, safeTitle, writer).catch((err) => {
      console.error('[zip-gallery] Erro no streaming:', err)
      writer.abort(err).catch(() => {})
    })

    return new Response(readable as unknown as ReadableStream, {
      headers: {
        ...CORS,
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(zipFilename)}`,
        'Transfer-Encoding': 'chunked',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  },
}

// ─── ZIP Streaming ────────────────────────────────────────────────────────────

/**
 * Implementação de ZIP com streaming usando fflate.
 * Formato ZIP: local file headers + data + central directory + end of central directory.
 * Usamos STORE (sem compressão) para imagens — já são comprimidas, DEFLATE não ajuda.
 */
async function streamZip(
  env: Env,
  photos: PhotoRow[],
  size: DownloadSize,
  folderName: string,
  writer: WritableStreamDefaultWriter<Uint8Array>
): Promise<void> {
  const centralDirectory: CentralDirEntry[] = []
  let offset = 0

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i]
    const r2Key = resolveKey(photo, size)
    if (!r2Key) continue

    // Busca arquivo do R2 via binding (sem egress)
    const obj = await env.FOTUX_BUCKET.get(r2Key)
    if (!obj) {
      console.warn(`[zip-gallery] Chave não encontrada no R2: ${r2Key}`)
      continue
    }

    const fileBuffer = await obj.arrayBuffer()
    const fileData = new Uint8Array(fileBuffer)

    // Nome do arquivo dentro do ZIP
    const ext = extFromKey(r2Key)
    const baseName = sanitizeName(photo.title ?? `foto-${i + 1}`)
    const entryName = `${folderName}/${baseName}.${ext}`
    const nameBytes = new TextEncoder().encode(entryName)

    const crc = crc32(fileData)
    const fileSize = fileData.byteLength

    // Local file header
    const localHeader = buildLocalHeader(nameBytes, fileSize, crc)
    await writer.write(localHeader)
    offset += localHeader.byteLength

    // File data (sem compressão — STORE)
    await writer.write(fileData)
    const dataOffset = offset
    offset += fileSize

    centralDirectory.push({ nameBytes, fileSize, crc, localHeaderOffset: dataOffset - localHeader.byteLength })
    offset += 0 // já contabilizado acima
  }

  // Central directory
  const cdOffset = offset
  for (const entry of centralDirectory) {
    const cdEntry = buildCentralDirEntry(entry)
    await writer.write(cdEntry)
    offset += cdEntry.byteLength
  }

  // End of central directory
  const eocd = buildEOCD(centralDirectory.length, offset - cdOffset, cdOffset)
  await writer.write(eocd)

  await writer.close()
}

// ─── ZIP Format helpers ───────────────────────────────────────────────────────

interface CentralDirEntry {
  nameBytes: Uint8Array
  fileSize: number
  crc: number
  localHeaderOffset: number
}

function buildLocalHeader(nameBytes: Uint8Array, fileSize: number, crc: number): Uint8Array {
  const buf = new ArrayBuffer(30 + nameBytes.length)
  const view = new DataView(buf)
  const u8 = new Uint8Array(buf)

  view.setUint32(0,  0x504b0304, false) // signature
  view.setUint16(4,  20, true)          // version needed
  view.setUint16(6,  0x0800, true)      // flags: UTF-8
  view.setUint16(8,  0, true)           // compression: STORE
  view.setUint16(10, 0, true)           // mod time
  view.setUint16(12, 0, true)           // mod date
  view.setUint32(14, crc, true)
  view.setUint32(18, fileSize, true)    // compressed size
  view.setUint32(22, fileSize, true)    // uncompressed size
  view.setUint16(26, nameBytes.length, true)
  view.setUint16(28, 0, true)           // extra field length
  u8.set(nameBytes, 30)

  return u8
}

function buildCentralDirEntry(entry: CentralDirEntry): Uint8Array {
  const { nameBytes, fileSize, crc, localHeaderOffset } = entry
  const buf = new ArrayBuffer(46 + nameBytes.length)
  const view = new DataView(buf)
  const u8 = new Uint8Array(buf)

  view.setUint32(0,  0x504b0102, false) // signature
  view.setUint16(4,  20, true)          // version made by
  view.setUint16(6,  20, true)          // version needed
  view.setUint16(8,  0x0800, true)      // flags: UTF-8
  view.setUint16(10, 0, true)           // compression: STORE
  view.setUint16(12, 0, true)           // mod time
  view.setUint16(14, 0, true)           // mod date
  view.setUint32(16, crc, true)
  view.setUint32(20, fileSize, true)    // compressed size
  view.setUint32(24, fileSize, true)    // uncompressed size
  view.setUint16(28, nameBytes.length, true)
  view.setUint16(30, 0, true)           // extra length
  view.setUint16(32, 0, true)           // comment length
  view.setUint16(34, 0, true)           // disk number start
  view.setUint16(36, 0, true)           // internal attributes
  view.setUint32(38, 0, true)           // external attributes
  view.setUint32(42, localHeaderOffset, true)
  u8.set(nameBytes, 46)

  return u8
}

function buildEOCD(entryCount: number, cdSize: number, cdOffset: number): Uint8Array {
  const buf = new ArrayBuffer(22)
  const view = new DataView(buf)

  view.setUint32(0,  0x504b0506, false) // signature
  view.setUint16(4,  0, true)           // disk number
  view.setUint16(6,  0, true)           // disk with central dir
  view.setUint16(8,  entryCount, true)
  view.setUint16(10, entryCount, true)
  view.setUint32(12, cdSize, true)
  view.setUint32(16, cdOffset, true)
  view.setUint16(20, 0, true)           // comment length

  return new Uint8Array(buf)
}

/** CRC-32 para ZIP */
function crc32(data: Uint8Array): number {
  const table = makeCrcTable()
  let crc = 0xFFFFFFFF
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF]
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

let _crcTable: Uint32Array | null = null
function makeCrcTable(): Uint32Array {
  if (_crcTable) return _crcTable
  _crcTable = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = c & 1 ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    _crcTable[i] = c
  }
  return _crcTable
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

async function fetchJob(env: Env, jobId: string): Promise<JobRow | null> {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/jobs?id=eq.${jobId}&select=id,title,download_enabled,download_high_res,download_web_size`,
    {
      headers: {
        'apikey': env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    }
  )
  if (!res.ok) return null
  const rows = await res.json() as JobRow[]
  return rows[0] ?? null
}

async function fetchDeliveryPhotos(env: Env, jobId: string): Promise<PhotoRow[]> {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/site_images?job_id=eq.${jobId}&upload_mode=eq.delivery&select=id,title,r2_key,variant_2048_key,variant_1024_key,upload_mode&order=display_order.asc`,
    {
      headers: {
        'apikey': env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    }
  )
  if (!res.ok) return []
  return res.json() as Promise<PhotoRow[]>
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * Resolve a key R2 correta com base no tamanho solicitado.
 * Fallback para master se a variante não existir ainda.
 */
function resolveKey(photo: PhotoRow, size: DownloadSize): string | null {
  if (size === '2048') return photo.variant_2048_key ?? photo.r2_key
  if (size === '1024') return photo.variant_1024_key ?? photo.variant_2048_key ?? photo.r2_key
  return photo.r2_key // 'original'
}

/**
 * Verifica se o tamanho pedido está habilitado nas configurações do job.
 * download_high_res e download_web_size são strings simples (ex: "original", "2048")
 * ou JSON arrays para compatibilidade futura.
 */
function isSizeAllowed(job: JobRow, size: DownloadSize): boolean {
  const toList = (val: string | null): string[] => {
    if (!val) return []
    try {
      const parsed = JSON.parse(val)
      return Array.isArray(parsed) ? parsed : [String(parsed)]
    } catch {
      return [val] // string simples
    }
  }
  const highRes = toList(job.download_high_res)
  const webSize = toList(job.download_web_size)
  const all = [...highRes, ...webSize]

  if (size === 'original') return all.includes('original') || all.includes('3600')
  return all.includes(size)
}

function extFromKey(key: string): string {
  const match = key.match(/\.([a-zA-Z0-9]+)$/)
  return match ? match[1].toLowerCase() : 'jpg'
}

function sanitizeName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '-').trim().slice(0, 100)
}
