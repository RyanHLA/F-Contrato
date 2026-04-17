import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Retorna o photographer_id do usuário logado consultando a tabela photographers.
 * Filtra explicitamente pelo user_id da sessão ativa para garantir isolamento.
 */
export const usePhotographerId = () => {
  const [photographerId, setPhotographerId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from('photographers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setPhotographerId(data.id);
        });
    });
  }, []);

  return photographerId;
};
