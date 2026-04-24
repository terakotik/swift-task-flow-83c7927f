import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import ExecutorDashboard from './ExecutorDashboard';
import { LogIn, Gift } from 'lucide-react';

const REF_STORAGE_KEY = 'pending_referral_code';

export default function UserAuth() {
  const { user, loading } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [refCode, setRefCode] = useState<string>('');
  const [refName, setRefName] = useState<string>('');
  const { toast } = useToast();

  // Read ?ref= from URL on mount, persist in localStorage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('ref')?.toUpperCase().trim();
    const stored = localStorage.getItem(REF_STORAGE_KEY)?.toUpperCase().trim();
    const code = fromUrl || stored || '';
    if (fromUrl) localStorage.setItem(REF_STORAGE_KEY, fromUrl);
    if (code) {
      setRefCode(code);
      setIsLogin(false); // open in signup mode
      setAuthOpen(true);
      // Lookup referrer name
      supabase.rpc('lookup_referrer', { _code: code }).then(({ data }) => {
        const d = data as any;
        if (d?.found) setRefName(d.name || '');
      });
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (user) return <ExecutorDashboard />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const redirectUrl = `${window.location.origin}/uzero`;
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectUrl,
            data: refCode ? { referral_code: refCode } : undefined,
          },
        });
        if (error) throw error;
        // Clear stored ref code after successful signup
        localStorage.removeItem(REF_STORAGE_KEY);
        toast({
          title: 'Регистрация успешна',
          description: refCode
            ? `Проверьте почту. Вы зарегистрированы по приглашению ${refName || refCode}.`
            : 'Проверьте почту для подтверждения',
        });
      }
    } catch (err: any) {
      toast({ title: 'Ошибка', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <ExecutorDashboard
        demoMode
        hideExitDemo
        demoFooter={
          <Button
            onClick={() => setAuthOpen(true)}
            className="w-full font-black uppercase tracking-widest h-14 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg gap-2"
          >
            <LogIn size={20} />
            Подключиться
          </Button>
        }
      />

      <Dialog open={authOpen} onOpenChange={setAuthOpen}>
        <DialogContent className="sm:max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black">
              {isLogin ? 'Вход' : 'Регистрация'}
            </DialogTitle>
            <DialogDescription>Кабинет исполнителя</DialogDescription>
          </DialogHeader>

          {!isLogin && refCode && (
            <div className="bg-accent/10 border border-accent/30 rounded-2xl p-3 flex items-center gap-3">
              <Gift className="text-accent shrink-0" size={20} />
              <div className="min-w-0">
                <p className="text-[10px] font-black text-accent uppercase tracking-widest">Вас пригласил друг</p>
                <p className="text-sm font-bold text-foreground truncate">
                  {refName || `Код: ${refCode}`}
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
            <Input type="password" placeholder="Пароль" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
            <Button type="submit" className="w-full font-bold" disabled={submitting}>
              {submitting ? 'Загрузка...' : isLogin ? 'Войти' : 'Зарегистрироваться'}
            </Button>
          </form>
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="w-full text-center text-sm text-primary mt-2 font-semibold"
          >
            {isLogin ? 'Нет аккаунта? Зарегистрироваться' : 'Есть аккаунт? Войти'}
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}
