import { supabase } from "@/integrations/supabase/client";

export type UploadMode = 'selection' | 'delivery' | 'covers' | 'watermarks' | 'logos'

export const r2Storage = {
  /**
   * Faz upload do arquivo master original para o R2 (bucket privado).
   * Sem compressão — o Cloudflare Worker gera as variantes de forma assíncrona.
   *
   * @returns { key } em caso de sucesso, null em caso de erro
   */
  upload: async (
    file: File,
    mode: UploadMode = 'selection'
  ): Promise<{ key: string } | null> => {
    try {
      const { data, error: functionError } = await supabase.functions.invoke('upload-url2', {
        body: {
          action:   'upload',
          mode,
          filename: file.name,
          fileType: file.type,
          fileSize: file.size,
        },
      })

      if (functionError) {
        // Log detalhado para debug
        const ctx = (functionError as any).context
        if (ctx) {
          try { const t = await ctx.json(); console.error('[r2Storage.upload] Edge error:', t) } catch { /* ignore */ }
        }
        throw functionError
      }
      if (!data?.uploadUrl) throw new Error('URL de upload não retornada pela função.')

      // PUT direto no R2 com presigned URL (sem Content-Type sniffing)
      const uploadResponse = await fetch(data.uploadUrl, {
        method:  'PUT',
        body:    file,
        headers: { 'Content-Type': file.type },
      })

      if (!uploadResponse.ok) {
        throw new Error(`Falha no upload para o R2: ${uploadResponse.statusText}`)
      }

      return { key: data.key }

    } catch (error) {
      console.error('[r2Storage.upload]', error)
      return null
    }
  },

  /**
   * Gera presigned URLs em lote para múltiplos objetos privados no R2.
   * Uma única chamada à Edge Function — muito mais eficiente do que N chamadas individuais.
   */
  signBatch: async (keys: string[], expiresIn = 3600): Promise<Record<string, string>> => {
    try {
      const { data, error } = await supabase.functions.invoke('upload-url2', {
        body: { action: 'sign-batch', keys, expiresIn },
      })
      if (error) throw error
      return data?.urls ?? {}
    } catch (error) {
      console.error('[r2Storage.signBatch]', error)
      return {}
    }
  },

  /**
   * Gera uma presigned URL de leitura para um objeto privado no R2.
   * Use para exibir imagens e oferecer downloads seguros.
   *
   * @param key   - Chave do objeto no R2
   * @param expiresIn - Tempo de expiração em segundos (padrão: 1h)
   */
  sign: async (key: string, expiresIn = 3600): Promise<string | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('upload-url2', {
        body: { action: 'sign', key, expiresIn },
      })

      if (error) throw error
      return data?.url ?? null

    } catch (error) {
      console.error('[r2Storage.sign]', error)
      return null
    }
  },

  /**
   * Deleta um arquivo do R2 via Edge Function.
   * A Edge Function valida que a key pertence ao fotógrafo logado.
   */
  /**
   * Faz upload de uma logo de fotógrafo para o R2 (modo 'logos').
   * Retorna a key e uma presigned URL de 6 dias (máx R2: 7 dias).
   * A URL é renovada automaticamente a cada abertura do contrato via signLogo().
   */
  uploadLogo: async (file: File): Promise<{ key: string; url: string } | null> => {
    try {
      // 1. Obter presigned PUT URL
      const { data, error: uploadErr } = await supabase.functions.invoke('upload-url2', {
        body: {
          action:   'upload',
          mode:     'logos',
          filename: file.name,
          fileType: file.type,
          fileSize: file.size,
        },
      })
      if (uploadErr) throw uploadErr
      if (!data?.uploadUrl) throw new Error('URL de upload não retornada')

      // 2. PUT direto no R2
      const res = await fetch(data.uploadUrl, {
        method:  'PUT',
        body:    file,
        headers: { 'Content-Type': file.type },
      })
      if (!res.ok) throw new Error(`Falha no upload: ${res.statusText}`)

      // 3. Gerar presigned GET URL — máximo 6 dias (limite R2: 7 dias)
      const { data: signed, error: signErr } = await supabase.functions.invoke('upload-url2', {
        body: { action: 'sign', key: data.key, expiresIn: 6 * 24 * 3600 },
      })
      if (signErr || !signed?.url) throw signErr ?? new Error('URL assinada não retornada')

      return { key: data.key, url: signed.url }
    } catch (error) {
      console.error('[r2Storage.uploadLogo]', error)
      return null
    }
  },

  /**
   * Renova a presigned URL de uma logo existente (6 dias).
   * Chame ao abrir o contrato se a URL puder estar expirada.
   */
  signLogo: async (key: string): Promise<string | null> => {
    return r2Storage.sign(key, 6 * 24 * 3600)
  },

  delete: async (key: string): Promise<boolean> => {
    try {
      const { error } = await supabase.functions.invoke('upload-url2', {
        body: { action: 'delete', key },
      })

      if (error) throw error
      return true
    } catch (error) {
      console.error('[r2Storage.delete]', error)
      return false
    }
  },
}
