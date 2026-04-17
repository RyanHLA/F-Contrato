import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Lock, Loader2, Check, Send, CheckCircle2 } from 'lucide-react';

const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

function getPinRateLimit(albumId: string) {
  try {
    const raw = localStorage.getItem(`pin_rl_${albumId}`);
    if (raw) return JSON.parse(raw) as { attempts: number; lockedUntil: number | null };
  } catch {}
  return { attempts: 0, lockedUntil: null };
}

function recordPinFailure(albumId: string) {
  const current = getPinRateLimit(albumId);
  const attempts = current.attempts + 1;
  const lockedUntil = attempts >= PIN_MAX_ATTEMPTS ? Date.now() + PIN_LOCKOUT_MS : null;
  localStorage.setItem(`pin_rl_${albumId}`, JSON.stringify({ attempts, lockedUntil }));
  return { attempts, lockedUntil };
}

function clearPinRateLimit(albumId: string) {
  localStorage.removeItem(`pin_rl_${albumId}`);
}

// Session token stored in sessionStorage (cleared when tab closes)
function saveSessionToken(albumId: string, token: string) {
  sessionStorage.setItem(`client_token_${albumId}`, token);
}

interface Album {
  id: string;
  title: string;
  category: string;
  selection_limit: number | null;
  client_submitted_at: string | null;
}

interface Photo {
  id: string;
  image_url: string;
  title: string | null;
  display_order: number | null;
}

type Stage = 'pin' | 'selecting' | 'submitted';

const ClientProof = () => {
  const { albumId } = useParams<{ albumId: string }>();
  const [stage, setStage] = useState<Stage>('pin');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [pinLockedUntil, setPinLockedUntil] = useState<number | null>(() => {
    if (!albumId) return null;
    const rl = getPinRateLimit(albumId);
    return rl.lockedUntil && rl.lockedUntil > Date.now() ? rl.lockedUntil : null;
  });
  const [pinRemainingSeconds, setPinRemainingSeconds] = useState(0);

  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [album, setAlbum] = useState<Album | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [existingSelections, setExistingSelections] = useState<Set<string>>(new Set());
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Countdown timer while PIN is locked
  useEffect(() => {
    if (!pinLockedUntil) return;
    const interval = setInterval(() => {
      const remaining = Math.ceil((pinLockedUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setPinLockedUntil(null);
        if (albumId) clearPinRateLimit(albumId);
        clearInterval(interval);
      } else {
        setPinRemainingSeconds(remaining);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [pinLockedUntil, albumId]);

  // Se já foi submetido antes, mostrar tela de concluído direto
  useEffect(() => {
    if (!albumId) return;
    supabase
      .from('albums')
      .select('id, title, category, selection_limit, client_submitted_at')
      .eq('id', albumId)
      .eq('client_enabled', true)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.client_submitted_at) {
          setAlbum(data);
          setStage('submitted');
        }
      });
  }, [albumId]);

  const loadAlbumData = async (albumId: string, token: string) => {
    setLoadingPhotos(true);

    // Set token as Postgres session variable so RLS policies allow access
    await supabase.rpc('set_client_token', { p_token: token });

    const [albumRes, photosRes, selectionsRes] = await Promise.all([
      supabase
        .from('albums')
        .select('id, title, category, selection_limit, client_submitted_at')
        .eq('id', albumId)
        .single(),
      supabase
        .from('site_images')
        .select('id, image_url, title, display_order')
        .eq('album_id', albumId)
        .order('display_order'),
      supabase
        .from('client_selections')
        .select('image_id')
        .eq('album_id', albumId),
    ]);

    setAlbum(albumRes.data);
    setPhotos(photosRes.data || []);

    if (selectionsRes.data) {
      const ids = new Set(selectionsRes.data.map((s) => s.image_id));
      setExistingSelections(ids);
      setSelected(new Set(ids));
    }

    setLoadingPhotos(false);
    setStage('selecting');
  };

  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!albumId) return;

    const rl = getPinRateLimit(albumId);
    if (rl.lockedUntil && rl.lockedUntil > Date.now()) {
      setPinLockedUntil(rl.lockedUntil);
      return;
    }

    setVerifying(true);
    setPinError('');

    // verify_album_pin now returns a UUID session token (or null on failure)
    const { data: token, error } = await supabase.rpc('verify_album_pin', {
      album_uuid: albumId,
      pin_attempt: pin.trim(),
    });

    if (error || !token) {
      const updated = recordPinFailure(albumId);
      if (updated.lockedUntil) {
        setPinLockedUntil(updated.lockedUntil);
        setPinError('');
      } else {
        const left = PIN_MAX_ATTEMPTS - updated.attempts;
        setPinError(`PIN incorreto. Verifique com o fotógrafo.${left > 0 ? ` ${left} tentativa${left !== 1 ? 's' : ''} restante${left !== 1 ? 's' : ''}.` : ''}`);
      }
      setVerifying(false);
      return;
    }

    clearPinRateLimit(albumId);
    saveSessionToken(albumId, token);
    setSessionToken(token);
    setVerifying(false);

    await loadAlbumData(albumId, token);
  };

  const togglePhoto = (id: string) => {
    if (album?.client_submitted_at) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        const limit = album?.selection_limit;
        if (limit && next.size >= limit) return prev;
        next.add(id);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!albumId || !album || !sessionToken) return;
    setSubmitting(true);

    // Ensure token is set in Postgres session before DB operations
    await supabase.rpc('set_client_token', { p_token: sessionToken });

    const toDelete = [...existingSelections].filter((id) => !selected.has(id));
    const toInsert = [...selected].filter((id) => !existingSelections.has(id));

    if (toDelete.length > 0) {
      await supabase
        .from('client_selections')
        .delete()
        .eq('album_id', albumId)
        .in('image_id', toDelete);
    }

    if (toInsert.length > 0) {
      await supabase.from('client_selections').insert(
        toInsert.map((image_id) => ({ album_id: albumId, image_id }))
      );
    }

    // Submit via server-side function (validates token again)
    await supabase.rpc('submit_client_selections', {
      p_album_id: albumId,
      p_token: sessionToken,
    });

    // Clear session after submission
    sessionStorage.removeItem(`client_token_${albumId}`);

    setSubmitting(false);
    setStage('submitted');
  };

  // --- TELA: PIN ---
  const isPinLocked = !!pinLockedUntil && pinLockedUntil > Date.now();
  const pinLockMinutes = Math.ceil(pinRemainingSeconds / 60);

  if (stage === 'pin') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <div className="w-full max-w-sm space-y-8 text-center">
          <div>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
              <Lock className="h-7 w-7 text-amber-600" />
            </div>
            <h1 className="font-serif text-2xl text-slate-800">Acesso ao Álbum</h1>
            <p className="mt-2 text-sm text-slate-500">
              Insira o PIN fornecido pelo fotógrafo para acessar suas fotos.
            </p>
          </div>

          {isPinLocked ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-medium text-red-700">Acesso temporariamente bloqueado</p>
              <p className="mt-1 text-sm text-red-600">
                Muitas tentativas incorretas. Tente novamente em{' '}
                <span className="font-semibold">{pinLockMinutes} minuto{pinLockMinutes !== 1 ? 's' : ''}</span>.
              </p>
            </div>
          ) : (
            <form onSubmit={handleVerifyPin} className="space-y-4">
              <Input
                type="text"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="PIN de acesso"
                className="text-center text-lg tracking-widest"
                autoFocus
                required
              />
              {pinError && <p className="text-sm text-red-600">{pinError}</p>}
              <Button
                type="submit"
                disabled={verifying || !pin.trim()}
                className="w-full bg-slate-900 text-white hover:bg-slate-800"
              >
                {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Acessar'}
              </Button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // --- TELA: SUBMETIDO ---
  if (stage === 'submitted') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" />
          <div>
            <h1 className="font-serif text-2xl text-slate-800">Seleção Enviada!</h1>
            <p className="mt-2 text-sm text-slate-500">
              Suas fotos foram selecionadas com sucesso. O fotógrafo receberá sua escolha em breve.
            </p>
          </div>
          {album && (
            <p className="text-xs text-slate-400">Álbum: {album.title}</p>
          )}
        </div>
      </div>
    );
  }

  // --- TELA: SELEÇÃO ---
  if (loadingPhotos) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    );
  }

  const limit = album?.selection_limit;
  const count = selected.size;

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header fixo */}
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="font-serif text-xl text-slate-800">{album?.title}</h1>
            <p className="text-sm text-slate-500 capitalize">{album?.category}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-700">
                {count} {limit ? `/ ${limit}` : ''} selecionada{count !== 1 ? 's' : ''}
              </p>
              {limit && (
                <p className="text-xs text-slate-400">
                  {limit - count} restante{limit - count !== 1 ? 's' : ''}
                </p>
              )}
            </div>
            <Button
              onClick={handleSubmit}
              disabled={submitting || count === 0}
              className="bg-emerald-600 text-white hover:bg-emerald-700 gap-2"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Enviar Seleção
                </>
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* Grid de fotos */}
      <main className="mx-auto max-w-6xl px-4 py-8">
        {photos.length === 0 ? (
          <div className="py-20 text-center text-slate-400">
            Nenhuma foto disponível neste álbum.
          </div>
        ) : (
          <div className="columns-2 gap-3 sm:columns-3 md:columns-4 lg:columns-5">
            {photos.map((photo) => {
              const isSelected = selected.has(photo.id);
              const isLimitReached = !!limit && count >= limit && !isSelected;

              return (
                <div
                  key={photo.id}
                  onClick={() => !isLimitReached && togglePhoto(photo.id)}
                  className={`group relative mb-3 break-inside-avoid overflow-hidden rounded-lg transition-all duration-200 ${
                    isLimitReached
                      ? 'cursor-not-allowed opacity-40'
                      : 'cursor-pointer'
                  } ${isSelected ? 'ring-3 ring-emerald-500 ring-offset-2' : ''}`}
                >
                  <img
                    src={photo.image_url}
                    alt={photo.title || ''}
                    className="w-full"
                    loading="lazy"
                  />
                  {/* Overlay de seleção */}
                  <div
                    className={`absolute inset-0 transition-all duration-200 ${
                      isSelected
                        ? 'bg-emerald-500/20'
                        : 'bg-black/0 group-hover:bg-black/10'
                    }`}
                  />
                  {isSelected && (
                    <div className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 shadow-md">
                      <Check className="h-4 w-4 text-white" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Barra inferior mobile */}
      <div className="sticky bottom-0 border-t border-slate-100 bg-white px-6 py-4 sm:hidden">
        <Button
          onClick={handleSubmit}
          disabled={submitting || count === 0}
          className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
        >
          {submitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              Enviar {count} foto{count !== 1 ? 's' : ''} selecionada{count !== 1 ? 's' : ''}
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default ClientProof;
