import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import ExecutorDashboard from './ExecutorDashboard';
import { Wallet, Tag, Smartphone, Users, Rocket, Gift, Sparkles, ArrowRight } from 'lucide-react';
import heroImg from '@/assets/uzero-hero.png';

const REF_STORAGE_KEY = 'pending_referral_code';

export default function UserAuth() {
  const { user, loading } = useAuth();
  const [isLogin, setIsLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [refCode, setRefCode] = useState<string>('');
  const [refName, setRefName] = useState<string>('');
  const { toast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('ref')?.toUpperCase().trim();
    const stored = localStorage.getItem(REF_STORAGE_KEY)?.toUpperCase().trim();
    const code = fromUrl || stored || '';
    if (fromUrl) localStorage.setItem(REF_STORAGE_KEY, fromUrl);
    if (code) {
      setRefCode(code);
      setIsLogin(false);
      supabase.rpc('lookup_referrer', { _code: code }).then(({ data }) => {
        const d = data as any;
        if (d?.found) setRefName(d.name || '');
      });
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFD60A]">
        <div className="animate-spin w-10 h-10 border-4 border-black border-t-transparent rounded-full" />
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
        localStorage.removeItem(REF_STORAGE_KEY);
        toast({
          title: 'Регистрация успешна 🎉',
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

  const benefits = [
    { icon: Wallet, text: 'Быстрые выплаты' },
    { icon: Smartphone, text: 'Работа с телефона' },
    { icon: Users, text: 'Удобный кабинет' },
  ];

  return (
    <div className="min-h-screen bg-[#FFD60A] relative overflow-hidden">
      {/* decorative blobs */}
      <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-[#FF2E93] opacity-20 blur-3xl" />
      <div className="absolute top-1/3 -left-24 w-72 h-72 rounded-full bg-[#FFEF7A] opacity-60 blur-3xl" />
      <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full bg-[#FF2E93] opacity-15 blur-3xl" />

      {/* dotted pattern */}
      <div
        className="absolute inset-0 opacity-[0.07] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)',
          backgroundSize: '18px 18px',
        }}
      />

      <div className="relative max-w-md mx-auto px-5 pt-8 pb-10">
        {/* Top brand chip */}
        <div className="flex items-center justify-between mb-4">
          <div className="bg-black text-[#FFD60A] px-3 py-1.5 rounded-full flex items-center gap-1.5">
            <Sparkles size={14} className="text-[#FFD60A]" />
            <span className="text-[11px] font-black uppercase tracking-widest">Яндекс Еда</span>
          </div>
          <div className="bg-[#FF2E93] text-white px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest shadow-lg shadow-[#FF2E93]/30">
            Заработок
          </div>
        </div>

        {/* Hero headline */}
        <div className="mb-3">
          <h1 className="text-[34px] leading-[0.95] font-black text-black tracking-tight">
            ПРИГЛАШАЕМ
          </h1>
          <div className="inline-block mt-1">
            <span className="inline-block bg-[#FF2E93] text-white text-[34px] leading-none font-black px-3 py-1 rounded-2xl shadow-lg shadow-[#FF2E93]/40 -rotate-1">
              ЗАРАБОТАТЬ
            </span>
          </div>
          <h2 className="text-[28px] leading-[0.95] font-black text-black tracking-tight mt-2">
            НА РЕСТОРАНАХ!
          </h2>
        </div>

        {/* Hero image */}
        <div className="relative -mx-2 my-2">
          <img
            src={heroImg}
            alt="Заработок на заданиях"
            className="w-full h-auto rounded-3xl"
            draggable={false}
          />
        </div>

        {/* Benefits */}
        <div className="bg-white/70 backdrop-blur rounded-3xl p-4 border-2 border-black/5 shadow-xl mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="bg-[#FF2E93] text-white text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full">
              Преимущества
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {benefits.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2 bg-white rounded-2xl p-2.5 border border-black/5">
                <div className="w-8 h-8 rounded-xl bg-[#FF2E93] text-white flex items-center justify-center shrink-0">
                  <Icon size={16} />
                </div>
                <span className="text-[12px] font-black text-black uppercase leading-tight">{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Referral banner */}
        {refCode && (
          <div className="bg-black text-[#FFD60A] rounded-2xl p-3 flex items-center gap-3 mb-4 shadow-lg">
            <Gift className="text-[#FFD60A] shrink-0" size={22} />
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Вас пригласил друг</p>
              <p className="text-sm font-black truncate">{refName || `Код: ${refCode}`}</p>
            </div>
          </div>
        )}

        {/* Auth card */}
        <div className="bg-black rounded-3xl p-5 shadow-2xl">
          {/* Tabs */}
          <div className="bg-white/10 p-1 rounded-2xl flex mb-4">
            <button
              type="button"
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-2.5 rounded-xl text-[12px] font-black uppercase tracking-widest transition-all ${
                !isLogin ? 'bg-[#FFD60A] text-black shadow-lg' : 'text-white/70'
              }`}
            >
              Регистрация
            </button>
            <button
              type="button"
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-2.5 rounded-xl text-[12px] font-black uppercase tracking-widest transition-all ${
                isLogin ? 'bg-[#FFD60A] text-black shadow-lg' : 'text-white/70'
              }`}
            >
              Вход
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="h-12 rounded-2xl bg-white border-0 text-black placeholder:text-black/40 font-semibold px-4"
            />
            <Input
              type="password"
              placeholder="Пароль"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              className="h-12 rounded-2xl bg-white border-0 text-black placeholder:text-black/40 font-semibold px-4"
            />
            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-14 rounded-2xl bg-[#FF2E93] hover:bg-[#FF2E93]/90 text-white font-black uppercase tracking-widest text-sm shadow-lg shadow-[#FF2E93]/40 gap-2"
            >
              {submitting ? (
                'Загрузка...'
              ) : (
                <>
                  {isLogin ? 'Войти' : 'Присоединяйся!'}
                  <ArrowRight size={18} />
                </>
              )}
            </Button>
          </form>

          <div className="flex items-center gap-2 mt-4 text-white/60 text-[11px] font-semibold justify-center">
            <Rocket size={12} />
            <span>Выводим тебя на новый уровень дохода</span>
          </div>
        </div>

        <p className="text-center text-[11px] font-bold text-black/50 mt-5 uppercase tracking-widest">
          десятки участников · открытый чат
        </p>
      </div>
    </div>
  );
}
