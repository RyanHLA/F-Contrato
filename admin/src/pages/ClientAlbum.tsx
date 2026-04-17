import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Lock, Loader2, CheckCircle2,
  Heart, Download,
  Columns, Check, X, ChevronLeft, ChevronRight,
  ZoomIn, ZoomOut, Trophy, MessageSquare, ShoppingBag,
  ArrowLeft, CreditCard, Banknote,
} from 'lucide-react';

/* ─── PIN rate-limit helpers ────────────────────────────────────────── */
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 15 * 60 * 1000;

function getPinRateLimit(jobId: string) {
  try {
    const raw = localStorage.getItem(`pin_rl_${jobId}`);
    if (raw) return JSON.parse(raw) as { attempts: number; lockedUntil: number | null };
  } catch {}
  return { attempts: 0, lockedUntil: null };
}

function recordPinFailure(jobId: string) {
  const current = getPinRateLimit(jobId);
  const attempts = current.attempts + 1;
  const lockedUntil = attempts >= PIN_MAX_ATTEMPTS ? Date.now() + PIN_LOCKOUT_MS : null;
  localStorage.setItem(`pin_rl_${jobId}`, JSON.stringify({ attempts, lockedUntil }));
  return { attempts, lockedUntil };
}

function clearPinRateLimit(jobId: string) {
  localStorage.removeItem(`pin_rl_${jobId}`);
}

/* ─── Types ─────────────────────────────────────────────────────────── */
interface JobMeta {
  id: string;
  title: string;
  event_type: string | null;
  gallery_selection_limit: number | null;
  gallery_submitted_at: string | null;
  gallery_pin: string | null;
  gallery_share_token: string | null;
  gallery_enabled: boolean;
  gallery_cover_image_url: string | null;
  download_enabled: boolean;
  download_high_res: string | null;
  download_web_size: string | null;
  watermark_position: string | null;
  watermark_size: number | null;
  watermarks: { image_url: string } | null;
  extra_photo_enabled: boolean;
  extra_photo_price: number | null;
}

interface Photo {
  id: string;
  image_url: string;
  title: string | null;
  display_order: number | null;
  photo_set_id: string | null;
  upload_mode: 'selection' | 'delivery' | null;
  r2_key: string | null;
  variant_2048_key: string | null;
  variant_1024_key: string | null;
}

interface PhotoSet {
  id: string;
  name: string;
  display_order: number;
}

type Stage = 'loading' | 'pin' | 'selecting' | 'review' | 'checkout' | 'submitted' | 'invalid';

/* ─── Main component ─────────────────────────────────────────────────── */
const ClientAlbum = () => {
  const { albumId: jobId } = useParams<{ slug: string; albumId: string }>();
  const [searchParams] = useSearchParams();
  const shareToken = searchParams.get('t');
  const isPreview = searchParams.get('preview') === '1';

  /* auth / load states */
  const [stage, setStage] = useState<Stage>('loading');
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [pinLockedUntil, setPinLockedUntil] = useState<number | null>(() => {
    if (!jobId) return null;
    const rl = getPinRateLimit(jobId);
    return rl.lockedUntil && rl.lockedUntil > Date.now() ? rl.lockedUntil : null;
  });
  const [pinRemainingSeconds, setPinRemainingSeconds] = useState(0);

  const [jobMeta, setJobMeta] = useState<JobMeta | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [sets, setSets] = useState<PhotoSet[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [existingSelections, setExistingSelections] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  /* ZIP download states */
  const [zipModal, setZipModal] = useState(false);
  const [zipSize, setZipSize] = useState<'original' | '2048' | '1024'>('2048');
  const [zipLoading, setZipLoading] = useState(false);

  /* Extra photo banner (non-blocking) */
  const [showExtraBanner, setShowExtraBanner] = useState(false);

  /* Checkout state */
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'card'>('pix');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [pendingPurchaseId, setPendingPurchaseId] = useState<string | null>(null);

  /* PIX data */
  const [pixCode, setPixCode] = useState<string | null>(null);
  const [pixQr, setPixQr] = useState<string | null>(null);
  const [pixPolling, setPixPolling] = useState(false);

  /* Card form */
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardCpf, setCardCpf] = useState('');
  const [cardInstallments, setCardInstallments] = useState(1);

  /* gallery UI states */
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [imageComments, setImageComments] = useState<Record<string, string>>({});
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [compareQueue, setCompareQueue] = useState<string[]>([]);
  const [isComparing, setIsComparing] = useState(false);
  const [syncTransform, setSyncTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [winnerId, setWinnerId] = useState<string | null>(null);

  const touchStartX = useRef<number | null>(null);
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const pixPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── PIN countdown ── */
  useEffect(() => {
    if (!pinLockedUntil) return;
    const interval = setInterval(() => {
      const remaining = Math.ceil((pinLockedUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setPinLockedUntil(null);
        if (jobId) clearPinRateLimit(jobId);
        clearInterval(interval);
      } else {
        setPinRemainingSeconds(remaining);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [pinLockedUntil, jobId]);

  useEffect(() => {
    if (!jobId) return;
    init();
  }, [jobId, shareToken]);

  /* scroll lock when lightbox/compare open */
  useEffect(() => {
    document.body.style.overflow = activeImageId || isComparing ? 'hidden' : 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [activeImageId, isComparing]);

  /* cleanup PIX polling on unmount */
  useEffect(() => {
    return () => {
      if (pixPollRef.current) clearInterval(pixPollRef.current);
    };
  }, []);

  const init = async () => {
    if (!jobId) return;
    let query = supabase
      .from('jobs')
      .select('id, title, event_type, gallery_selection_limit, gallery_submitted_at, gallery_pin, gallery_share_token, gallery_enabled, gallery_cover_image_url, download_enabled, download_high_res, download_web_size, watermark_position, watermark_size, watermarks(image_url), extra_photo_enabled, extra_photo_price')
      .eq('id', jobId);
    if (!isPreview) query = query.eq('gallery_enabled', true);
    const { data: job } = await query.maybeSingle();

    if (!job) { setStage('invalid'); return; }

    let jobData = job as Record<string, unknown>;
    const coverKey = job.gallery_cover_image_url;
    if (coverKey && !coverKey.startsWith('http')) {
      const { data: signRes } = await supabase.functions.invoke('sign-gallery-url', {
        body: { jobId, keys: [coverKey] },
      });
      const signedCover = signRes?.urls?.[coverKey] ?? null;
      jobData = { ...jobData, gallery_cover_image_url: signedCover };
    }

    setJobMeta(jobData as unknown as JobMeta);

    if (job.gallery_submitted_at && !isPreview) { setStage('submitted'); return; }
    if (isPreview) { await loadPhotosAndSelections(jobId); return; }
    if (shareToken && job.gallery_share_token === shareToken) { await loadPhotosAndSelections(jobId); return; }
    if (!job.gallery_pin) { await loadPhotosAndSelections(jobId); return; }
    setStage('pin');
  };

  const loadPhotosAndSelections = async (jId: string) => {
    const [photosRes, selectionsRes, setsRes] = await Promise.all([
      supabase.from('site_images').select('id, image_url, title, display_order, photo_set_id, upload_mode, r2_key, variant_2048_key, variant_1024_key').eq('job_id', jId).order('display_order'),
      supabase.from('job_client_selections').select('image_id').eq('job_id', jId),
      supabase.from('job_photo_sets').select('id, name, display_order').eq('job_id', jId).order('display_order'),
    ]);
    let loadedPhotos = (photosRes.data || []) as unknown as Photo[];
    const loadedSets = (setsRes.data || []) as PhotoSet[];

    const privatePhotos = loadedPhotos.filter(p => p.r2_key && !p.image_url);
    if (privatePhotos.length > 0) {
      const keys = privatePhotos.map(p => p.variant_2048_key ?? p.r2_key!);
      const { data: signRes } = await supabase.functions.invoke('sign-gallery-url', {
        body: { jobId: jId, keys },
      });
      const urlMap: Record<string, string> = signRes?.urls ?? {};
      loadedPhotos = loadedPhotos.map((p) => {
        if (!p.r2_key || p.image_url) return p;
        const key = p.variant_2048_key ?? p.r2_key;
        return { ...p, image_url: urlMap[key] ?? '' };
      });
    }

    setPhotos(loadedPhotos);
    setSets(loadedSets);

    const hasHighlights = loadedPhotos.some(p => p.photo_set_id === null);
    if (!hasHighlights && loadedSets.length > 0) {
      setActiveSetId(loadedSets[0].id);
    }

    if (selectionsRes.data) {
      const ids = new Set<string>((selectionsRes.data as { image_id: string }[]).map((s) => s.image_id));
      setExistingSelections(ids);
      setSelected(new Set<string>(ids));
    }
    setStage('selecting');
  };

  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobId || !jobMeta) return;
    const rl = getPinRateLimit(jobId);
    if (rl.lockedUntil && rl.lockedUntil > Date.now()) { setPinLockedUntil(rl.lockedUntil); return; }
    setVerifying(true);
    setPinError('');
    if (pinInput.trim() === jobMeta.gallery_pin) {
      clearPinRateLimit(jobId);
      setVerifying(false);
      await loadPhotosAndSelections(jobId);
    } else {
      const updated = recordPinFailure(jobId);
      if (updated.lockedUntil) {
        setPinLockedUntil(updated.lockedUntil);
        setPinError('');
      } else {
        const left = PIN_MAX_ATTEMPTS - updated.attempts;
        setPinError(`PIN incorreto.${left > 0 ? ` ${left} tentativa${left !== 1 ? 's' : ''} restante${left !== 1 ? 's' : ''}.` : ''}`);
      }
      setVerifying(false);
    }
  };

  /* ── Selection logic (non-blocking) ── */
  const togglePhoto = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (jobMeta?.gallery_submitted_at) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // Show non-blocking banner when limit exceeded
        const limit = jobMeta?.gallery_selection_limit;
        if (limit && next.size > limit && jobMeta?.extra_photo_enabled && jobMeta?.extra_photo_price) {
          setShowExtraBanner(true);
        }
      }
      return next;
    });
  };

  /* ── Computed derived values ── */
  const limit = jobMeta?.gallery_selection_limit ?? null;
  const extraPhotos = limit ? Math.max(0, selected.size - limit) : 0;
  const extraCost = extraPhotos * (jobMeta?.extra_photo_price ?? 0);
  const hasExtras = extraPhotos > 0 && !!jobMeta?.extra_photo_enabled;

  /* ── Review & checkout flow ── */
  const handleFinalize = () => {
    if (selected.size === 0) return;
    setStage('review');
  };

  const removeFromSelection = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const getClientToken = () => {
    const existing = shareToken ?? localStorage.getItem(`client_token_${jobId}`);
    if (existing) return existing;
    const t = crypto.randomUUID();
    localStorage.setItem(`client_token_${jobId}`, t);
    return t;
  };

  /* Submit without payment (no extras) */
  const handleSubmitDirect = async () => {
    if (!jobId || !jobMeta) return;
    setSubmitting(true);
    const toDelete = [...existingSelections].filter((id) => !selected.has(id));
    const toInsert = [...selected].filter((id) => !existingSelections.has(id));
    if (toDelete.length > 0) await supabase.from('job_client_selections').delete().eq('job_id', jobId).in('image_id', toDelete);
    if (toInsert.length > 0) await supabase.from('job_client_selections').insert(toInsert.map((image_id) => ({ job_id: jobId, image_id })));
    await supabase.from('jobs').update({ gallery_submitted_at: new Date().toISOString() }).eq('id', jobId);
    setSubmitting(false);
    setStage('submitted');
  };

  /* Submit after payment confirmed */
  const handleSubmitAfterPayment = async () => {
    if (!jobId || !jobMeta) return;
    const toDelete = [...existingSelections].filter((id) => !selected.has(id));
    const toInsert = [...selected].filter((id) => !existingSelections.has(id));
    if (toDelete.length > 0) await supabase.from('job_client_selections').delete().eq('job_id', jobId).in('image_id', toDelete);
    if (toInsert.length > 0) await supabase.from('job_client_selections').insert(toInsert.map((image_id) => ({ job_id: jobId, image_id })));
    await supabase.from('jobs').update({ gallery_submitted_at: new Date().toISOString() }).eq('id', jobId);
    setStage('submitted');
  };

  /* ── PIX payment ── */
  const handlePixPayment = async () => {
    if (!jobId) return;
    setCheckoutLoading(true);
    setCheckoutError('');
    try {
      const clientToken = getClientToken();
      const { data, error } = await supabase.functions.invoke('mp-create-payment', {
        body: { jobId, quantity: extraPhotos, clientToken, method: 'pix' },
      });
      if (error || data?.error) throw new Error(error?.message ?? data?.error ?? 'Erro ao criar pagamento PIX');

      setPendingPurchaseId(data.purchaseId);
      setPixCode(data.pixCode ?? null);
      setPixQr(data.pixQr ?? null);

      // Start polling for payment confirmation
      if (data.purchaseId) {
        startPixPolling(data.purchaseId);
      }
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Erro ao processar pagamento');
    } finally {
      setCheckoutLoading(false);
    }
  };

  const startPixPolling = (purchaseId: string) => {
    setPixPolling(true);
    if (pixPollRef.current) clearInterval(pixPollRef.current);
    pixPollRef.current = setInterval(async () => {
      const { data } = await supabase
        .from('extra_photo_purchases')
        .select('status')
        .eq('id', purchaseId)
        .single();

      if (data?.status === 'approved') {
        if (pixPollRef.current) clearInterval(pixPollRef.current);
        setPixPolling(false);
        await handleSubmitAfterPayment();
      } else if (data?.status === 'rejected' || data?.status === 'cancelled') {
        if (pixPollRef.current) clearInterval(pixPollRef.current);
        setPixPolling(false);
        setCheckoutError('Pagamento não aprovado. Tente novamente.');
        setPixCode(null);
        setPixQr(null);
        setPendingPurchaseId(null);
      }
    }, 4000);
  };

  /* ── Card payment ── */
  const handleCardPayment = async () => {
    if (!jobId) return;
    setCheckoutLoading(true);
    setCheckoutError('');
    try {
      // 1. Busca a Public Key do fotógrafo via Edge Function
      const pkFetch = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mp-get-public-key?jobId=${jobId}`,
        { headers: { 'Content-Type': 'application/json' } }
      );
      if (!pkFetch.ok) throw new Error('Não foi possível obter a chave de pagamento. Tente novamente.');
      const pkData = await pkFetch.json() as { publicKey?: string; error?: string };
      if (pkData.error || !pkData.publicKey) throw new Error(pkData.error ?? 'Public Key não encontrada');

      // 2. Tokeniza o cartão diretamente no MP usando a Public Key (seguro por design)
      const rawNumber = cardNumber.replace(/\s/g, '');
      const [expMonth, expYear2] = cardExpiry.split('/').map(s => s.trim());

      // A Public Key vai como query param, não como Bearer token
      const tokenRes = await fetch(`https://api.mercadopago.com/v1/card_tokens?public_key=${encodeURIComponent(pkData.publicKey)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          card_number:      rawNumber,
          expiration_month: expMonth,
          expiration_year:  expYear2.length === 2 ? `20${expYear2}` : expYear2,
          security_code:    cardCvv,
          cardholder: {
            name: cardName,
            identification: { type: 'CPF', number: cardCpf.replace(/\D/g, '') },
          },
        }),
      });

      if (!tokenRes.ok) {
        const tokenErr = await tokenRes.json().catch(() => ({})) as { message?: string };
        throw new Error(tokenErr.message ?? 'Dados do cartão inválidos. Verifique e tente novamente.');
      }

      const tokenData = await tokenRes.json() as { id: string };

      // 3. Detecta bandeira
      const paymentMethodId = (() => {
        if (rawNumber.startsWith('4')) return 'visa';
        if (/^5[1-5]/.test(rawNumber)) return 'master';
        if (/^3[47]/.test(rawNumber)) return 'amex';
        if (/^(60110|637095|637568|637599|637609|637612)/.test(rawNumber)) return 'elo';
        if (/^6011|^65/.test(rawNumber)) return 'discover';
        return 'visa';
      })();

      // 4. Envia o token para a Edge Function processar o pagamento
      const clientToken = getClientToken();
      const { data, error } = await supabase.functions.invoke('mp-create-payment', {
        body: {
          jobId,
          quantity: extraPhotos,
          clientToken,
          method: 'card',
          card: {
            token: tokenData.id,
            holderName: cardName,
            cpf: cardCpf.replace(/\D/g, ''),
            installments: cardInstallments,
            paymentMethodId,
          },
        },
      });
      if (error || data?.error) throw new Error(error?.message ?? data?.error ?? 'Erro ao processar cartão');

      if (data?.status === 'approved') {
        await handleSubmitAfterPayment();
      } else {
        setCheckoutError('Pagamento não aprovado. Verifique os dados do cartão.');
      }
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Erro ao processar pagamento');
    } finally {
      setCheckoutLoading(false);
    }
  };

  /* ── Download helper ── */
  const handleDownload = async (e: React.MouseEvent, photo: Photo) => {
    e.stopPropagation();
    if (!jobMeta?.download_enabled || photo.upload_mode !== 'delivery') return;

    const key = (() => {
      if (jobMeta.download_high_res && photo.r2_key) return photo.r2_key;
      if (jobMeta.download_web_size === '2048' && photo.variant_2048_key) return photo.variant_2048_key;
      if (jobMeta.download_web_size === '1024' && photo.variant_1024_key) return photo.variant_1024_key;
      return photo.variant_2048_key ?? photo.r2_key;
    })();

    if (!key) return;

    const ext = key.split('.').pop() ?? 'jpg';
    const baseName = photo.title ?? 'foto';
    const filename = `${baseName}.${ext}`;

    const { data: signRes } = await supabase.functions.invoke('sign-gallery-url', {
      body: { jobId, keys: [key], forDownload: true, filename },
    });
    const url = signRes?.urls?.[key];
    if (!url) return;

    const blob = await fetch(url).then(r => r.blob());
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
  };

  /* ── Download ZIP ── */
  const handleDownloadZip = async () => {
    if (!jobId || !jobMeta) return;
    setZipLoading(true);
    try {
      const workerUrl = `${import.meta.env.VITE_ZIP_WORKER_URL}/zip`;
      const res = await fetch(workerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, size: zipSize }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Erro desconhecido' })) as { error: string };
        throw new Error(err.error ?? 'Falha ao gerar ZIP');
      }

      const blob = await res.blob();
      const sizeLabel = zipSize === 'original' ? 'Original' : zipSize === '2048' ? '2048px' : '1024px';
      const filename = `${jobMeta.title ?? 'galeria'} - ${sizeLabel}.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setZipModal(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao baixar galeria');
    } finally {
      setZipLoading(false);
    }
  };

  /* ── Comment helpers ── */
  const handleCommentChange = (id: string, text: string) => {
    setImageComments(prev => ({ ...prev, [id]: text }));
  };
  const toggleEditingComment = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setEditingCommentId(editingCommentId === id ? null : id);
  };

  /* ── Compare helpers ── */
  const toggleCompareQueue = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setCompareQueue(prev => {
      if (prev.includes(id)) return prev.filter(imgId => imgId !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };
  const startComparison = () => {
    if (compareQueue.length < 2) return;
    setIsComparing(true);
    setWinnerId(null);
    setSyncTransform({ scale: 1, x: 0, y: 0 });
  };
  const exitComparison = () => {
    setIsComparing(false);
    setCompareQueue([]);
    setWinnerId(null);
  };
  const keepImage = (id: string) => {
    setSelected(prev => new Set(prev).add(id));
    setCompareQueue(prev => {
      const q = prev.filter(imgId => imgId !== id);
      if (q.length < 1) { exitComparison(); return []; }
      return q;
    });
    setSyncTransform({ scale: 1, x: 0, y: 0 });
  };
  const discardImage = (id: string) => {
    setCompareQueue(prev => {
      const q = prev.filter(imgId => imgId !== id);
      if (q.length === 1) { setWinnerId(q[0]); return q; }
      if (q.length === 0) { exitComparison(); return []; }
      return q;
    });
    setSyncTransform({ scale: 1, x: 0, y: 0 });
  };
  const confirmWinner = () => {
    if (winnerId) { setSelected(prev => new Set(prev).add(winnerId!)); exitComparison(); }
  };

  /* ── Zoom/pan ── */
  const handleWheelZoom = (e: React.WheelEvent) => {
    if (winnerId) return;
    e.preventDefault();
    setSyncTransform(prev => {
      const newScale = Math.min(Math.max(1, prev.scale - e.deltaY * 0.005), 5);
      if (newScale === 1) return { scale: 1, x: 0, y: 0 };
      return { ...prev, scale: newScale };
    });
  };
  const handleMouseDown = (e: React.MouseEvent) => {
    if (winnerId) return;
    isDragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || winnerId) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    setSyncTransform(prev => {
      if (prev.scale === 1) return prev;
      return { ...prev, x: prev.x + dx, y: prev.y + dy };
    });
    lastPos.current = { x: e.clientX, y: e.clientY };
  };
  const handleMouseUp = () => { isDragging.current = false; };
  const handleMouseLeave = () => { isDragging.current = false; };
  const changeZoom = (factor: number) => {
    if (winnerId) return;
    setSyncTransform(prev => {
      const newScale = Math.min(Math.max(1, prev.scale + factor), 5);
      if (newScale === 1) return { scale: 1, x: 0, y: 0 };
      return { ...prev, scale: newScale };
    });
  };

  /* ── Navigation ── */
  const navigate = useCallback((direction: number) => {
    const visible = photos.filter(p => activeSetId === null || p.photo_set_id === activeSetId);
    const idx = visible.findIndex(p => p.id === activeImageId);
    let next = idx + direction;
    if (next < 0) next = visible.length - 1;
    if (next >= visible.length) next = 0;
    setActiveImageId(visible[next].id);
    setEditingCommentId(null);
  }, [activeImageId, photos, activeSetId]);

  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) navigate(diff > 0 ? 1 : -1);
    touchStartX.current = null;
  };

  /* keyboard */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isComparing) {
        if (e.key === 'Escape') exitComparison();
        if (e.key === 'Enter' && winnerId) confirmWinner();
        return;
      }
      if (!activeImageId) return;
      if ((e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'Escape') setActiveImageId(null);
      if (e.key === 'ArrowLeft') navigate(-1);
      if (e.key === 'ArrowRight') navigate(1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeImageId, isComparing, navigate, winnerId]);

  const activePhoto = photos.find(p => p.id === activeImageId);
  const comparingPhotos = compareQueue.map(id => photos.find(p => p.id === id)).filter(Boolean) as Photo[];

  /* ════════════════════════════════════════════════════════════════════
     SCREENS: loading / invalid / pin / submitted
  ════════════════════════════════════════════════════════════════════ */
  if (stage === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (stage === 'invalid') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <Lock className="mx-auto h-12 w-12 text-slate-300" />
          <h1 className="font-serif text-2xl text-slate-700">Galeria não encontrada</h1>
          <p className="text-sm text-slate-400">Este link pode ter expirado ou a galeria não está disponível.</p>
        </div>
      </div>
    );
  }

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
            <h1 className="font-serif text-2xl text-slate-800">Acesso às Fotos</h1>
            <p className="mt-2 text-sm text-slate-500">Insira o PIN fornecido pelo fotógrafo para acessar suas fotos.</p>
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
              <Input type="text" value={pinInput} onChange={(e) => setPinInput(e.target.value)} placeholder="PIN de acesso" className="text-center text-lg tracking-widest" autoFocus required />
              {pinError && <p className="text-sm text-red-600">{pinError}</p>}
              <Button type="submit" disabled={verifying || !pinInput.trim()} className="w-full bg-slate-900 text-white hover:bg-slate-800">
                {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Acessar'}
              </Button>
            </form>
          )}
        </div>
      </div>
    );
  }

  if (stage === 'submitted') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" />
          <div>
            <h1 className="font-serif text-2xl text-slate-800">Seleção Enviada!</h1>
            <p className="mt-2 text-sm text-slate-500">Suas fotos foram selecionadas com sucesso. O fotógrafo receberá sua escolha em breve.</p>
          </div>
          {jobMeta && <p className="text-xs text-slate-400">{jobMeta.title}</p>}
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════════════
     SCREEN: REVIEW
  ════════════════════════════════════════════════════════════════════ */
  if (stage === 'review') {
    const packagePhotos = limit ? [...selected].slice(0, limit) : [...selected];
    const extraPhotoList = limit ? [...selected].slice(limit) : [];

    return (
      <div className="min-h-screen bg-white font-sans">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-100 shadow-[0_2px_15px_rgba(0,0,0,0.05)]">
          <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between">
            <button
              onClick={() => setStage('selecting')}
              className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors text-sm font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar à galeria
            </button>
            <h1 className="text-sm font-bold uppercase tracking-widest text-gray-800">Revisar Seleção</h1>
            <div className="w-24" />
          </div>
        </header>

        <div className="max-w-3xl mx-auto px-5 py-8 space-y-10">
          {/* Package photos */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[13px] font-bold uppercase tracking-widest text-gray-700">
                No Pacote
                <span className="ml-2 text-[11px] font-normal text-gray-400">({packagePhotos.length}{limit ? `/${limit}` : ''})</span>
              </h2>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {packagePhotos.map(id => {
                const photo = photos.find(p => p.id === id);
                if (!photo) return null;
                return (
                  <div key={id} className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100">
                    <img src={photo.image_url} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeFromSelection(id)}
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Extra photos */}
          {extraPhotoList.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[13px] font-bold uppercase tracking-widest text-amber-600">
                  Extras — a pagar
                  <span className="ml-2 text-[11px] font-normal text-amber-500">({extraPhotoList.length} foto{extraPhotoList.length !== 1 ? 's' : ''})</span>
                </h2>
                <span className="text-sm font-bold text-amber-700">
                  {extraCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                {extraPhotoList.map(id => {
                  const photo = photos.find(p => p.id === id);
                  if (!photo) return null;
                  return (
                    <div key={id} className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100 ring-2 ring-amber-400">
                      <img src={photo.image_url} alt="" className="w-full h-full object-cover" />
                      <button
                        onClick={() => removeFromSelection(id)}
                        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
              {jobMeta?.extra_photo_price && (
                <p className="mt-3 text-[11px] text-gray-400">
                  {extraPhotoList.length} foto{extraPhotoList.length !== 1 ? 's' : ''} extra{extraPhotoList.length !== 1 ? 's' : ''} × {jobMeta.extra_photo_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} cada
                </p>
              )}
            </section>
          )}

          {/* Summary & CTA */}
          <div className="border-t border-gray-100 pt-6 space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">{selected.size} foto{selected.size !== 1 ? 's' : ''} selecionada{selected.size !== 1 ? 's' : ''}</span>
              {hasExtras && (
                <span className="font-bold text-amber-700">
                  Total extras: {extraCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              )}
            </div>

            {hasExtras ? (
              <button
                onClick={() => setStage('checkout')}
                className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-white font-bold uppercase tracking-widest text-[12px] rounded-xl transition-colors shadow-lg flex items-center justify-center gap-3"
              >
                <ShoppingBag className="w-4 h-4" />
                Finalizar e Pagar Extras — {extraCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </button>
            ) : (
              <button
                onClick={handleSubmitDirect}
                disabled={submitting || selected.size === 0}
                className="w-full py-4 bg-gray-900 hover:bg-black text-white font-bold uppercase tracking-widest text-[12px] rounded-xl transition-colors shadow-lg flex items-center justify-center gap-3 disabled:opacity-40"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Confirmar Seleção
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════════════
     SCREEN: CHECKOUT
  ════════════════════════════════════════════════════════════════════ */
  if (stage === 'checkout') {
    const fmtCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    return (
      <div className="min-h-screen bg-gray-50 font-sans">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-sm">
          <div className="max-w-lg mx-auto px-5 py-4 flex items-center justify-between">
            <button
              onClick={() => { setStage('review'); setPixCode(null); setPixQr(null); setPendingPurchaseId(null); setCheckoutError(''); }}
              className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors text-sm font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </button>
            <h1 className="text-sm font-bold uppercase tracking-widest text-gray-800">Pagamento</h1>
            <div className="w-16" />
          </div>
        </header>

        <div className="max-w-lg mx-auto px-5 py-8 space-y-6">
          {/* Order summary */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-3">Resumo</h2>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-700">{extraPhotos} foto{extraPhotos !== 1 ? 's' : ''} extra{extraPhotos !== 1 ? 's' : ''}</span>
              <span className="font-bold text-gray-900">{fmtCurrency(extraCost)}</span>
            </div>
            {jobMeta?.extra_photo_price && (
              <p className="text-[11px] text-gray-400 mt-1">{fmtCurrency(jobMeta.extra_photo_price)} × {extraPhotos}</p>
            )}
          </div>

          {/* PIX display (after generation) */}
          {pixCode && (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
                <Banknote className="w-6 h-6 text-emerald-500" />
              </div>
              <h3 className="font-bold text-gray-800">Pague com PIX</h3>
              {pixQr && (
                <img src={`data:image/png;base64,${pixQr}`} alt="QR Code PIX" className="w-44 h-44 mx-auto rounded-lg border border-gray-100" />
              )}
              <div className="relative">
                <p className="text-[10px] text-gray-500 mb-2 uppercase tracking-wider">Copia e cola</p>
                <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-3 border border-gray-200">
                  <p className="text-[10px] text-gray-600 break-all flex-1 font-mono text-left">{pixCode}</p>
                  <button
                    onClick={() => navigator.clipboard.writeText(pixCode)}
                    className="shrink-0 px-3 py-1.5 text-[10px] font-bold bg-gray-900 text-white rounded-lg hover:bg-black transition-colors"
                  >
                    Copiar
                  </button>
                </div>
              </div>
              {pixPolling && (
                <div className="flex items-center justify-center gap-2 text-[11px] text-gray-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Aguardando confirmação do pagamento...
                </div>
              )}
            </div>
          )}

          {/* Payment method selector (only when PIX not yet generated) */}
          {!pixCode && (
            <>
              <div className="flex rounded-xl overflow-hidden border border-gray-200 bg-white shadow-sm">
                <button
                  onClick={() => setPaymentMethod('pix')}
                  className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-[12px] font-bold transition-colors ${paymentMethod === 'pix' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  <Banknote className="w-4 h-4" />
                  PIX
                </button>
                <button
                  onClick={() => setPaymentMethod('card')}
                  className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-[12px] font-bold transition-colors ${paymentMethod === 'card' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  <CreditCard className="w-4 h-4" />
                  Cartão
                </button>
              </div>

              {paymentMethod === 'pix' && (
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 text-center space-y-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
                    <Banknote className="w-6 h-6 text-emerald-500" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-800 mb-1">Pagar com PIX</h3>
                    <p className="text-[12px] text-gray-500">Instantâneo e sem taxas. Você receberá um QR Code para pagar.</p>
                  </div>
                  <button
                    onClick={handlePixPayment}
                    disabled={checkoutLoading}
                    className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-[12px] uppercase tracking-widest rounded-xl transition-colors shadow-lg flex items-center justify-center gap-3 disabled:opacity-60"
                  >
                    {checkoutLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando PIX...</> : <>Gerar QR Code — {fmtCurrency(extraCost)}</>}
                  </button>
                </div>
              )}

              {paymentMethod === 'card' && (
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CreditCard className="w-5 h-5 text-gray-400" />
                    <h3 className="font-bold text-gray-800">Cartão de Crédito</h3>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1 block">Número do cartão</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={19}
                        value={cardNumber}
                        onChange={e => setCardNumber(e.target.value.replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ').trim())}
                        placeholder="0000 0000 0000 0000"
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-gray-400 font-mono tracking-wider"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1 block">Validade</label>
                        <input
                          type="text"
                          maxLength={5}
                          value={cardExpiry}
                          onChange={e => {
                            const v = e.target.value.replace(/\D/g, '');
                            setCardExpiry(v.length > 2 ? `${v.slice(0,2)}/${v.slice(2,4)}` : v);
                          }}
                          placeholder="MM/AA"
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-gray-400 font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1 block">CVV</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={4}
                          value={cardCvv}
                          onChange={e => setCardCvv(e.target.value.replace(/\D/g, ''))}
                          placeholder="000"
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-gray-400 font-mono"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1 block">Nome no cartão</label>
                      <input
                        type="text"
                        value={cardName}
                        onChange={e => setCardName(e.target.value.toUpperCase())}
                        placeholder="NOME COMPLETO"
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-gray-400 uppercase"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1 block">CPF do titular</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={14}
                        value={cardCpf}
                        onChange={e => {
                          const v = e.target.value.replace(/\D/g, '');
                          setCardCpf(v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4').replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3').replace(/(\d{3})(\d{1,3})/, '$1.$2'));
                        }}
                        placeholder="000.000.000-00"
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-gray-400 font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1 block">Parcelas</label>
                      <select
                        value={cardInstallments}
                        onChange={e => setCardInstallments(Number(e.target.value))}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-gray-400 bg-white"
                      >
                        {[1,2,3,6,12].map(n => (
                          <option key={n} value={n}>
                            {n}x {fmtCurrency(extraCost / n)}{n === 1 ? ' sem juros' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <button
                    onClick={handleCardPayment}
                    disabled={checkoutLoading || !cardNumber || !cardExpiry || !cardCvv || !cardName || !cardCpf}
                    className="w-full py-4 bg-gray-900 hover:bg-black text-white font-bold text-[12px] uppercase tracking-widest rounded-xl transition-colors shadow-lg flex items-center justify-center gap-3 disabled:opacity-40"
                  >
                    {checkoutLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Processando...</> : <>Pagar {fmtCurrency(extraCost)}</>}
                  </button>
                </div>
              )}
            </>
          )}

          {checkoutError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-[12px] text-red-700 font-medium">{checkoutError}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════════════
     SCREEN: SELECTING
  ════════════════════════════════════════════════════════════════════ */
  const count = selected.size;

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans selection:bg-gray-200">
      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        .heart-pop { transition: all 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
      `}</style>

      {/* ── Banner ── */}
      <header className="relative w-full h-[75vh] lg:h-[100vh] bg-gray-100">
        {(jobMeta?.gallery_cover_image_url || photos[0]) && (
          <img
            src={jobMeta?.gallery_cover_image_url ?? photos[0].image_url}
            alt="Capa"
            className="w-full h-full object-cover object-center"
          />
        )}
        <div className="absolute inset-0 bg-black/15" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/5 to-black/35" />
      </header>

      {/* ── Sticky nav ── */}
      <nav className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-100 shadow-[0_2px_15px_rgba(0,0,0,0.05)]">
        <div className="max-w-[2400px] mx-auto">
          <div className="flex items-center justify-between px-5 py-4">
            {/* Title */}
            <div className="flex flex-col">
              <h1 className="text-[21px] font-medium tracking-tight text-[#333] leading-tight font-serif lg:font-sans lg:font-bold lg:text-[17px] lg:uppercase lg:tracking-[0.1em]">
                {jobMeta?.title}
              </h1>
              {jobMeta?.event_type && (
                <span className="text-[11px] text-gray-400 tracking-[0.15em] uppercase font-light">{jobMeta.event_type}</span>
              )}
            </div>

            {/* Desktop categories */}
            <div className="hidden lg:flex items-center gap-8 px-5">
              {photos.some(p => p.photo_set_id === null) && (
                <button
                  onClick={() => setActiveSetId(null)}
                  className={`relative py-2 text-[10.5px] font-semibold uppercase tracking-[0.15em] transition-all ${activeSetId === null ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  Destaques
                  {activeSetId === null && <div className="absolute -bottom-1 left-0 right-0 h-[1.5px] bg-black" />}
                </button>
              )}
              {sets.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActiveSetId(s.id)}
                  className={`relative py-2 text-[10.5px] font-semibold uppercase tracking-[0.15em] transition-all ${activeSetId === s.id ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  {s.name}
                  {activeSetId === s.id && <div className="absolute -bottom-1 left-0 right-0 h-[1.5px] bg-black" />}
                </button>
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-4 text-gray-800">
              {jobMeta?.download_enabled && (
                <button
                  onClick={() => setZipModal(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-gray-200 hover:border-gray-400 text-[11px] font-semibold text-gray-600 hover:text-gray-900 transition-all"
                  title="Baixar galeria completa"
                >
                  <Download className="w-3.5 h-3.5" />
                  Baixar galeria
                </button>
              )}
              <div className="relative">
                <Heart className="w-[22px] h-[22px] lg:w-[19px] lg:h-[19px] hover:text-red-500 transition-colors cursor-pointer" strokeWidth={1.2} />
                {count > 0 && (
                  <div className="absolute -top-1 -right-2 bg-[#00A98F] text-white text-[9px] font-bold min-w-[15px] h-[15px] flex items-center justify-center rounded-full px-1 border border-white">
                    {count}
                  </div>
                )}
              </div>
              {!isPreview && (
                <button
                  onClick={handleFinalize}
                  disabled={count === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-900 hover:bg-black text-white text-[11px] font-bold uppercase tracking-widest rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
                >
                  <Check className="w-3.5 h-3.5" />
                  {limit
                    ? count > limit
                      ? `Finalizar (${limit} + ${count - limit} extras)`
                      : `Finalizar Seleção (${count}/${limit})`
                    : count > 0 ? `Finalizar Seleção (${count})` : 'Finalizar Seleção'}
                </button>
              )}
            </div>
          </div>

          {/* Mobile categories */}
          {(photos.some(p => p.photo_set_id === null) || sets.length > 0) && (
            <div className="lg:hidden flex items-center gap-6 px-5 border-t border-black/5 overflow-x-auto whitespace-nowrap scrollbar-hide mb-2" style={{ backgroundColor: '#F7F7F7' }}>
              {photos.some(p => p.photo_set_id === null) && (
                <button
                  onClick={() => setActiveSetId(null)}
                  className={`relative py-3.5 text-[15px] font-serif transition-all ${activeSetId === null ? 'text-gray-900' : 'text-gray-400'}`}
                >
                  Destaques
                  {activeSetId === null && <div className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-black" />}
                </button>
              )}
              {sets.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActiveSetId(s.id)}
                  className={`relative py-3.5 text-[15px] font-serif transition-all ${activeSetId === s.id ? 'text-gray-900' : 'text-gray-400'}`}
                >
                  {s.name}
                  {activeSetId === s.id && <div className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-black" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* ── Extra photos banner (non-blocking) ── */}
      {showExtraBanner && hasExtras && (
        <div className="sticky top-[73px] z-30 bg-amber-50 border-b border-amber-200 px-5 py-2.5 flex items-center justify-between">
          <p className="text-[12px] text-amber-800 font-medium">
            <span className="font-bold">{extraPhotos} foto{extraPhotos !== 1 ? 's' : ''} extra{extraPhotos !== 1 ? 's' : ''}</span>
            {' '}selecionada{extraPhotos !== 1 ? 's' : ''} — {extraCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} a mais
          </p>
          <button onClick={() => setShowExtraBanner(false)} className="text-amber-500 hover:text-amber-700 ml-4">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Gallery (masonry) ── */}
      <main className="w-full max-w-[2400px] mx-auto p-[4px] pb-32">
        <div className="columns-2 md:columns-3 lg:columns-4 gap-[4px] space-y-[4px]">
          {photos.filter(p => activeSetId === null || p.photo_set_id === activeSetId).map((photo) => {
            const isSelected = selected.has(photo.id);
            const isQueued = compareQueue.includes(photo.id);
            const hasComment = !!imageComments[photo.id];
            const photoIndex = limit ? [...selected].indexOf(photo.id) : -1;
            const isExtra = limit && isSelected && photoIndex >= limit;

            return (
              <div
                key={photo.id}
                className={`break-inside-avoid relative overflow-hidden bg-gray-100 cursor-zoom-in select-none group border-2 ${isQueued ? 'border-blue-500' : isExtra ? 'border-amber-400' : 'border-transparent'}`}
                onClick={() => setActiveImageId(photo.id)}
              >
                <img
                  src={photo.image_url}
                  alt={photo.title ?? ''}
                  className={`w-full h-auto transition-all duration-300 ${isQueued ? 'opacity-80' : ''}`}
                  loading="lazy"
                />

                {isExtra && (
                  <div className="absolute top-2 left-2 z-20 bg-amber-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                    Extra
                  </div>
                )}

                {hasComment && editingCommentId !== photo.id && (
                  <div className="absolute top-3 left-3 z-20 bg-black/60 backdrop-blur-md px-2 py-1 rounded-[4px] border border-white/10 pointer-events-none max-w-[80%]">
                    <p className="text-[9px] text-white/90 line-clamp-1 italic">"{imageComments[photo.id]}"</p>
                  </div>
                )}

                <div className="absolute bottom-3 right-3 z-20 flex gap-2">
                  {jobMeta?.download_enabled && photo.upload_mode === 'delivery' && (
                    <button
                      onClick={(e) => handleDownload(e, photo)}
                      className="flex items-center justify-center w-8 h-8 rounded-full shadow-lg backdrop-blur-md border border-white/10 bg-black/50 hover:bg-black/70 text-white/90 transition-all"
                      title="Baixar foto"
                    >
                      <Download className="w-4 h-4" strokeWidth={2} />
                    </button>
                  )}
                  <button
                    onClick={(e) => toggleEditingComment(e, photo.id)}
                    className={`flex items-center justify-center w-8 h-8 rounded-full shadow-lg backdrop-blur-md border border-white/10 transition-all ${hasComment ? 'bg-amber-500 text-white' : 'bg-black/50 hover:bg-black/70 text-white/90'}`}
                  >
                    <MessageSquare className="w-4 h-4" strokeWidth={2} />
                  </button>
                  <button
                    onClick={(e) => toggleCompareQueue(e, photo.id)}
                    className={`flex items-center justify-center w-8 h-8 rounded-full shadow-lg backdrop-blur-md border border-white/10 transition-all ${isQueued ? 'bg-blue-600 text-white' : 'bg-black/50 hover:bg-black/70 text-white/90'}`}
                  >
                    <Columns className="w-4 h-4" strokeWidth={2.5} />
                  </button>
                  <button
                    onClick={(e) => togglePhoto(e, photo.id)}
                    className="flex items-center justify-center w-8 h-8 rounded-full shadow-lg backdrop-blur-md border border-white/10 bg-black/50 hover:bg-black/70 transition-all"
                  >
                    <Heart
                      className={`heart-pop w-4 h-4 ${isSelected ? 'scale-110' : 'scale-100'}`}
                      style={{ fill: isSelected ? '#E63946' : 'transparent', color: isSelected ? '#E63946' : '#FFFFFF' }}
                      strokeWidth={isSelected ? 1.5 : 2}
                    />
                  </button>
                </div>

                {/* Comment modal on card */}
                {editingCommentId === photo.id && (
                  <div className="absolute inset-0 z-30 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
                    <div className="w-full max-w-[280px] bg-white/70 backdrop-blur-md rounded-[2px] p-4 shadow-2xl border border-white/20">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-700">Observação</span>
                        <button onClick={(e) => toggleEditingComment(e, photo.id)} className="text-gray-500 hover:text-black transition-colors"><X className="w-4 h-4" /></button>
                      </div>
                      <textarea
                        autoFocus
                        value={imageComments[photo.id] || ''}
                        onChange={(e) => handleCommentChange(photo.id, e.target.value)}
                        placeholder="Ex: Retocar fundo..."
                        className="w-full h-24 text-xs p-3 bg-white/30 border border-white/20 rounded-[2px] focus:outline-none resize-none leading-relaxed text-gray-800"
                      />
                      <button onClick={(e) => toggleEditingComment(e, photo.id)} className="mt-3 w-full py-2.5 bg-[#00A98F] hover:bg-[#008f79] text-white text-[10px] font-bold uppercase tracking-widest rounded-[2px] cursor-pointer transition-colors shadow-sm">
                        Guardar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>

      {/* ── Floating compare bar ── */}
      {compareQueue.length > 0 && !isComparing && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 bg-white/95 backdrop-blur-xl px-6 py-4 rounded-full shadow-2xl border border-gray-100 flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="flex -space-x-3">
              {compareQueue.map(id => {
                const p = photos.find(ph => ph.id === id);
                return p ? <img key={id} src={p.image_url} alt="" className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm" /> : null;
              })}
            </div>
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-600">{compareQueue.length} {compareQueue.length === 1 ? 'Foto' : 'Fotos'}</span>
          </div>
          <button onClick={startComparison} className="px-6 py-2 rounded-full text-[11px] font-bold tracking-widest uppercase bg-blue-600 text-white hover:bg-blue-700 shadow-md transition-colors">
            Comparar Fotos
          </button>
        </div>
      )}

      {/* ── Compare mode ── */}
      {isComparing && (
        <div className="fixed inset-0 z-[120] bg-white flex flex-col">
          <div className="absolute top-0 inset-x-0 p-4 lg:p-6 flex justify-between items-center z-20 border-b border-gray-100 bg-white/80 backdrop-blur-md">
            <div className="flex items-center gap-4 text-gray-900">
              <Columns className="w-5 h-5 text-gray-400" />
              <span className="text-xs font-bold uppercase tracking-[0.2em]">Comparando Fotos</span>
            </div>
            {!winnerId && (
              <div className="flex items-center gap-2 bg-gray-100 rounded-full border border-gray-200 p-1">
                <button onClick={() => changeZoom(-0.5)} className="p-2 text-gray-600 hover:text-black hover:bg-gray-200 rounded-full transition-colors"><ZoomOut className="w-4 h-4" /></button>
                <div className="px-2 text-xs font-mono text-gray-500">{Math.round(syncTransform.scale * 100)}%</div>
                <button onClick={() => changeZoom(0.5)} className="p-2 text-gray-600 hover:text-black hover:bg-gray-200 rounded-full transition-colors"><ZoomIn className="w-4 h-4" /></button>
              </div>
            )}
            <button onClick={exitComparison} className="p-2 text-gray-400 hover:text-black bg-gray-100 rounded-full border border-gray-200 transition-all"><X className="w-5 h-5" strokeWidth={2} /></button>
          </div>

          <div className={`flex-1 overflow-y-auto md:overflow-hidden grid gap-2 p-2 mt-16 lg:mt-20 grid-cols-1 ${comparingPhotos.length === 2 ? 'md:grid-cols-2' : ''} ${comparingPhotos.length === 3 ? 'md:grid-cols-3' : ''} ${winnerId ? 'md:grid-cols-1 max-w-4xl mx-auto w-full' : ''}`}>
            {comparingPhotos.map((photo) => (
              <div key={photo.id} className="relative w-full h-[60vh] md:h-full bg-gray-50 rounded-[4px] overflow-hidden flex flex-col group border border-gray-100 transition-all duration-500">
                <div
                  className={`relative flex-1 overflow-hidden flex items-center justify-center ${syncTransform.scale > 1 && !winnerId ? 'cursor-move' : 'cursor-zoom-in'} ${winnerId ? 'opacity-40 grayscale-[0.5]' : ''}`}
                  onWheel={handleWheelZoom}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseLeave}
                >
                  <img
                    src={photo.image_url}
                    alt=""
                    draggable={false}
                    className="w-full h-full object-contain transition-transform duration-75 ease-out"
                    style={{ transform: winnerId ? 'none' : `translate(${syncTransform.x}px, ${syncTransform.y}px) scale(${syncTransform.scale})`, transformOrigin: 'center center' }}
                  />
                </div>
                {winnerId === photo.id ? (
                  <div className="absolute inset-0 flex items-center justify-center p-6 bg-white/40 backdrop-blur-[2px] z-30">
                    <div className="bg-white border border-gray-100 p-8 rounded-2xl shadow-2xl flex flex-col items-center text-center max-w-sm">
                      <div className="w-16 h-16 bg-[#E63946] rounded-full flex items-center justify-center mb-6 shadow-xl shadow-red-500/20"><Trophy className="w-8 h-8 text-white" /></div>
                      <h3 className="text-gray-900 text-lg font-bold uppercase tracking-wider mb-2">Temos uma vencedora!</h3>
                      <p className="text-gray-500 text-sm mb-8 leading-relaxed">Deseja selecionar esta foto e voltar para a galeria?</p>
                      <button onClick={confirmWinner} className="w-full py-4 bg-[#E63946] hover:bg-[#D90429] text-white rounded-xl text-xs font-bold uppercase tracking-[0.2em] transition-all shadow-lg">Sim, selecionar agora</button>
                      <button onClick={exitComparison} className="w-full py-4 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-[10px] font-bold uppercase tracking-[0.2em] transition-all mt-3">Não, apenas sair</button>
                    </div>
                  </div>
                ) : (
                  !winnerId && (
                    <div className="p-4 bg-white flex flex-col-reverse xl:flex-row items-center justify-center gap-3 border-t border-gray-100 shrink-0 z-10">
                      <button onClick={() => discardImage(photo.id)} className="flex items-center justify-center gap-2 w-full xl:w-auto xl:px-6 h-[48px] md:h-[44px] rounded-[4px] border border-[#6C757D] text-[#6C757D] hover:bg-gray-100 transition-all text-[11px] font-bold uppercase tracking-widest"><X className="w-4 h-4" /> Remover</button>
                      <button onClick={() => keepImage(photo.id)} className="flex items-center justify-center gap-2 w-full xl:w-[160px] h-[48px] md:h-[44px] rounded-[4px] bg-[#E63946] hover:bg-[#D90429] text-white transition-all shadow-lg text-[11px] font-bold uppercase tracking-widest">
                        <Heart className="heart-pop w-4 h-4 fill-white" /> Selecionar
                      </button>
                    </div>
                  )
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Lightbox ── */}
      {activePhoto && !isComparing && (
        <div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white transition-all duration-300"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="absolute top-0 inset-x-0 p-6 flex justify-between items-center z-[110]">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
{(() => { const v = photos.filter(p => activeSetId === null || p.photo_set_id === activeSetId); return `${v.findIndex(p => p.id === activeImageId) + 1} / ${v.length}`; })()}
            </span>
            <button onClick={() => setActiveImageId(null)} className="text-gray-400 hover:text-black transition-colors p-2"><X className="w-8 h-8" strokeWidth={1.5} /></button>
          </div>

          <button onClick={() => navigate(-1)} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 hover:text-black transition-all z-[110] p-4 hidden md:block"><ChevronLeft className="w-10 h-10" strokeWidth={1} /></button>
          <button onClick={() => navigate(1)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 hover:text-black transition-all z-[110] p-4 hidden md:block"><ChevronRight className="w-10 h-10" strokeWidth={1} /></button>

          <div className="relative w-full h-full flex flex-col items-center justify-center p-4 md:p-12 pb-24 gap-8">
            <div className="relative flex-1 flex items-center justify-center h-full max-w-6xl overflow-hidden w-full">
              <img src={activePhoto.image_url} alt="" className="max-w-full max-h-full object-contain select-none shadow-xl bg-gray-50" />
            </div>

            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 z-[120]">
              <button
                onClick={(e) => toggleEditingComment(e, activePhoto.id)}
                className={`flex items-center justify-center w-12 h-12 rounded-full shadow-lg border transition-all ${imageComments[activePhoto.id] ? 'bg-amber-500 border-amber-500 text-white' : 'bg-gray-100 border-gray-200 hover:bg-gray-200 text-gray-700'}`}
              >
                <MessageSquare className="w-5 h-5" strokeWidth={2} />
              </button>
              <button
                onClick={(e) => togglePhoto(e, activePhoto.id)}
                className={`flex items-center justify-center gap-3 px-8 py-3.5 rounded-full shadow-lg border transition-all ${selected.has(activePhoto.id) ? 'bg-[#E63946] border-[#E63946] scale-105 shadow-[#E63946]/20' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
              >
                <Heart
                  className={`heart-pop w-5 h-5 ${selected.has(activePhoto.id) ? 'scale-110 fill-white text-white' : 'scale-100 text-gray-800'}`}
                  style={{ fill: selected.has(activePhoto.id) ? '#FFFFFF' : 'transparent' }}
                  strokeWidth={2}
                />
                <span className={`text-[11px] font-bold uppercase tracking-[0.2em] ${selected.has(activePhoto.id) ? 'text-white' : 'text-gray-800'}`}>
                  {selected.has(activePhoto.id) ? 'Selecionada' : 'Selecionar Foto'}
                </span>
              </button>
            </div>
          </div>

          {/* Comment in lightbox */}
          {editingCommentId === activePhoto.id && (
            <div className="absolute inset-0 z-[130] flex items-center justify-center p-6 bg-black/10 backdrop-blur-sm" onClick={(e) => toggleEditingComment(e, activePhoto.id)}>
              <div className="w-full max-w-md bg-white/70 backdrop-blur-md rounded-[2px] p-6 shadow-2xl border border-white/20" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-amber-500" />
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-700">Observação Técnica</span>
                  </div>
                  <button onClick={(e) => toggleEditingComment(e, activePhoto.id)} className="text-gray-500 hover:text-black transition-colors"><X className="w-5 h-5" /></button>
                </div>
                <textarea
                  autoFocus
                  value={imageComments[activePhoto.id] || ''}
                  onChange={(e) => handleCommentChange(activePhoto.id, e.target.value)}
                  placeholder="Instruções de edição..."
                  className="w-full h-40 text-sm p-4 bg-white/30 border border-white/20 rounded-[2px] focus:outline-none resize-none leading-relaxed text-gray-700"
                />
                <button onClick={(e) => toggleEditingComment(e, activePhoto.id)} className="mt-4 w-full py-3.5 bg-[#00A98F] hover:bg-[#008f79] text-white text-[11px] font-bold uppercase tracking-[0.2em] rounded-[2px] transition-colors shadow-lg">
                  Guardar
                </button>
              </div>
            </div>
          )}

          <div className="absolute inset-0 -z-10" onClick={() => setActiveImageId(null)} />
        </div>
      )}

      {/* ── Modal de Download ZIP ── */}
      {zipModal && jobMeta && (() => {
        const toList = (val: string | null): string[] => {
          if (!val) return [];
          try {
            const parsed = JSON.parse(val);
            return Array.isArray(parsed) ? parsed : [String(parsed)];
          } catch {
            return [val];
          }
        };
        const highRes = toList(jobMeta.download_high_res);
        const webSize = toList(jobMeta.download_web_size);

        const sizes: { value: 'original' | '2048' | '1024'; label: string; desc: string }[] = [];
        if (highRes.includes('original') || highRes.includes('3600')) {
          sizes.push({ value: 'original', label: 'Original', desc: 'Arquivo master sem alterações' });
        }
        if (webSize.includes('2048') || highRes.includes('2048')) {
          sizes.push({ value: '2048', label: '2048px', desc: 'Alta resolução em WebP' });
        }
        if (webSize.includes('1024')) {
          sizes.push({ value: '1024', label: '1024px', desc: 'Resolução web otimizada' });
        }

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
              <div className="px-6 pt-6 pb-3">
                <h2 className="text-[15px] font-bold text-gray-900">Baixar galeria completa</h2>
                <p className="text-[12px] text-gray-400 mt-0.5">Escolha o tamanho das fotos no ZIP</p>
              </div>

              <div className="px-4 pb-3 flex flex-col gap-2">
                {sizes.map(({ value, label, desc }) => (
                  <button
                    key={value}
                    onClick={() => setZipSize(value)}
                    className={`flex items-start gap-3 w-full text-left px-4 py-3 rounded-xl border-2 transition-colors ${
                      zipSize === value ? 'border-[#11b899] bg-[#11b899]/5' : 'border-gray-100 hover:border-gray-200'
                    }`}
                  >
                    <span className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                      zipSize === value ? 'border-[#11b899]' : 'border-gray-300'
                    }`}>
                      {zipSize === value && <span className="w-2 h-2 rounded-full bg-[#11b899]" />}
                    </span>
                    <span>
                      <span className="block text-[13px] font-semibold text-gray-800">{label}</span>
                      <span className="block text-[11px] text-gray-400 mt-0.5">{desc}</span>
                    </span>
                  </button>
                ))}

                {sizes.length === 0 && (
                  <p className="text-[12px] text-gray-400 text-center py-4">Nenhum tamanho disponível</p>
                )}
              </div>

              <div className="flex gap-2 px-4 pb-5 pt-1">
                <button
                  onClick={() => setZipModal(false)}
                  disabled={zipLoading}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[12px] font-semibold text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDownloadZip}
                  disabled={zipLoading || sizes.length === 0}
                  className="flex-1 py-2.5 rounded-xl bg-[#11b899] text-white text-[12px] font-semibold hover:bg-[#0ea584] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {zipLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      Baixar ZIP
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default ClientAlbum;
