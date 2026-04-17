import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { Lock, Loader2 } from 'lucide-react';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const STORAGE_KEY = 'auth_rate_limit';

interface RateLimit {
  attempts: number;
  lockedUntil: number | null;
}

function getRateLimit(): RateLimit {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { attempts: 0, lockedUntil: null };
}

function saveRateLimit(data: RateLimit) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function recordFailedAttempt(): RateLimit {
  const current = getRateLimit();
  const attempts = current.attempts + 1;
  const lockedUntil = attempts >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : null;
  const updated = { attempts, lockedUntil };
  saveRateLimit(updated);
  return updated;
}

function clearRateLimit() {
  localStorage.removeItem(STORAGE_KEY);
}

const Auth = () => {
  const { isAdmin, loading, signInWithEmail } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  useEffect(() => {
    if (!loading && isAdmin) {
      // Preserva query params (ex: ?checkout_plan=basico) ao redirecionar para /admin
      const params = window.location.search;
      navigate(`/admin${params}`);
    }
  }, [isAdmin, loading, navigate]);

  // Initialize lockout state from storage
  useEffect(() => {
    const rl = getRateLimit();
    if (rl.lockedUntil && rl.lockedUntil > Date.now()) {
      setLockedUntil(rl.lockedUntil);
    } else if (rl.lockedUntil) {
      clearRateLimit();
    }
  }, []);

  // Countdown timer while locked
  useEffect(() => {
    if (!lockedUntil) return;
    const interval = setInterval(() => {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setLockedUntil(null);
        clearRateLimit();
        clearInterval(interval);
      } else {
        setRemainingSeconds(remaining);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lockedUntil]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const rl = getRateLimit();
    if (rl.lockedUntil && rl.lockedUntil > Date.now()) {
      setLockedUntil(rl.lockedUntil);
      return;
    }

    setError('');
    setSubmitting(true);
    const err = await signInWithEmail(email, password);
    if (err) {
      const updated = recordFailedAttempt();
      if (updated.lockedUntil) {
        setLockedUntil(updated.lockedUntil);
        setError('');
      } else {
        const left = MAX_ATTEMPTS - updated.attempts;
        setError(`Email ou senha incorretos.${left > 0 ? ` ${left} tentativa${left !== 1 ? 's' : ''} restante${left !== 1 ? 's' : ''}.` : ''}`);
      }
    } else {
      clearRateLimit();
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  const isLocked = !!lockedUntil && lockedUntil > Date.now();
  const minutes = Math.ceil(remainingSeconds / 60);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50">
            <Lock className="h-8 w-8 text-indigo-500" />
          </div>
          <h1 className="font-serif text-3xl font-normal text-foreground">
            Área Administrativa
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Acesso exclusivo para gerenciamento
          </p>
        </div>

        {isLocked ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
            <p className="text-sm font-medium text-red-700">Acesso temporariamente bloqueado</p>
            <p className="mt-1 text-sm text-red-600">
              Muitas tentativas incorretas. Tente novamente em{' '}
              <span className="font-semibold">{minutes} minuto{minutes !== 1 ? 's' : ''}</span>.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-12 bg-slate-900 text-white hover:bg-slate-800"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Entrar'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
};

export default Auth;
