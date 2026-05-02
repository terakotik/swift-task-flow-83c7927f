import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  Scissors,
  Lightbulb,
  Play,
  Sparkles,
  Eye,
  Users,
  Rocket,
  Heart,
  Flame,
  TrendingUp,
  ChevronDown,
  CheckCircle2,
} from 'lucide-react';
import heroImg from '@/assets/reels-hero.png';
import pantherImg from '@/assets/reels-panther.png';

const PINK = 'bg-[hsl(330,85%,55%)]';
const PINK_TEXT = 'text-[hsl(330,85%,55%)]';
const PINK_SOFT = 'bg-[hsl(335,90%,96%)]';
const PINK_BORDER = 'border-[hsl(330,85%,80%)]';

const features = [
  { icon: Scissors, title: 'Изготовление видео нарезок', sub: 'Готовый контент под публикации' },
  { icon: Lightbulb, title: 'Креативные ролики', sub: 'Под актуальные тренды Reels / TikTok' },
  { icon: Play, title: 'Монтаж Reels / Shorts', sub: 'Динамичные склейки, которые удерживают' },
  { icon: Sparkles, title: 'Контент под бренды', sub: 'Бьюти-сфера, рестораны, e-commerce' },
];

const stats = [
  { icon: Eye, big: 'БОЛЬШЕ', small: 'ПРОСМОТРОВ', sub: 'РОСТ ОХВАТОВ' },
  { icon: Users, big: 'БОЛЬШЕ', small: 'КЛИЕНТОВ', sub: 'РОСТ ПРОДАЖ' },
  { icon: Rocket, big: 'БЫСТРЫЙ', small: 'ЗАПУСК', sub: 'МИНИМУМ ВРЕМЕНИ' },
];

const ReelsLanding = () => {
  const { toast } = useToast();
  const [showHow, setShowHow] = useState(false);
  const [form, setForm] = useState({ name: '', brand: '', contact: '', task: '' });
  const [submitted, setSubmitted] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    toast({ title: 'Заявка отправлена 💖', description: 'Мы свяжемся с вами в ближайшее время' });
    setTimeout(() => {
      setForm({ name: '', brand: '', contact: '', task: '' });
      setSubmitted(false);
    }, 3000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(335,90%,97%)] via-background to-[hsl(335,85%,95%)] overflow-hidden">
      <div className="max-w-md mx-auto px-4 pb-10 pt-2 space-y-7">
        {/* HERO IMAGE — blended into background, no frame */}
        <div className="relative -mx-4 -mt-2">
          <img
            src={heroImg}
            alt="Делаем видео для брендов которые смотрят"
            className="w-full block"
            style={{
              WebkitMaskImage:
                'radial-gradient(ellipse 100% 88% at 50% 45%, #000 60%, transparent 100%)',
              maskImage:
                'radial-gradient(ellipse 100% 88% at 50% 45%, #000 60%, transparent 100%)',
            }}
          />
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-[hsl(335,90%,97%)] pointer-events-none" />
        </div>

        {/* PRIMARY CTA — right under hero */}
        <a
          href="#order-form"
          className={`-mt-4 group relative block ${PINK} text-white rounded-3xl p-5 text-center shadow-2xl overflow-hidden active:scale-[0.98] transition-transform`}
        >
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/20 rounded-full blur-2xl" />
          <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
          <div className="relative flex items-center justify-center gap-2">
            <Flame size={22} />
            <span className="text-base font-black uppercase tracking-wider">Заказать ролик</span>
            <TrendingUp size={22} />
          </div>
          <div className="relative text-[11px] font-bold opacity-95 mt-1.5 uppercase tracking-wider">
            охваты · клиенты · продажи
          </div>
        </a>

        {/* HOOK */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-black leading-tight">
            Видео, которые <span className={PINK_TEXT}>взрывают</span> охваты
          </h1>
          <p className="text-sm text-muted-foreground font-semibold">
            Reels & Shorts для бьюти, ресторанов и e-com. От идеи до миллионов просмотров.
          </p>
        </div>

        {/* STATS BAR */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { v: '1M+', l: 'просмотров' },
            { v: '100K+', l: 'лайков' },
            { v: '300+', l: 'роликов' },
          ].map((s, i) => (
            <div
              key={i}
              className={`${PINK} text-white rounded-2xl p-3 text-center shadow-lg`}
            >
              <div className="text-xl font-black leading-none">{s.v}</div>
              <div className="text-[9px] font-bold uppercase tracking-wider mt-1 opacity-95">{s.l}</div>
            </div>
          ))}
        </div>

        {/* FEATURES */}
        <div className="space-y-2">
          {features.map((f, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 ${PINK_SOFT} ${PINK_BORDER} border-2 rounded-2xl p-3 shadow-sm`}
            >
              <div className={`${PINK} text-white w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow`}>
                <f.icon size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-black uppercase leading-tight">{f.title}</div>
                <div className="text-[11px] text-muted-foreground font-semibold mt-0.5">{f.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* PANTHER — strength meets softness */}
        <div className="relative flex justify-center -my-2">
          <div className="absolute inset-x-8 bottom-6 h-16 bg-[hsl(330,85%,55%)]/30 blur-3xl rounded-full" />
          <img
            src={pantherImg}
            alt="Сила, энергия и нежность"
            loading="lazy"
            width={1024}
            height={1024}
            className="relative w-72 h-auto drop-shadow-[0_20px_40px_hsl(330,85%,55%,0.35)]"
          />
        </div>

        <div className="text-center -mt-4 space-y-1">
          <div className="text-2xl font-black leading-tight">
            Мощь × <span className={PINK_TEXT}>Нежность</span>
          </div>
          <div className="text-xs text-muted-foreground font-semibold px-6">
            Строгий подход к качеству. Тёплый подход к людям.
          </div>
        </div>

        {/* STATS */}
        <div className="grid grid-cols-3 gap-2">
          {stats.map((s, i) => (
            <div
              key={i}
              className="bg-card rounded-2xl p-3 text-center border-2 border-[hsl(330,85%,90%)] shadow-sm"
            >
              <s.icon className={`mx-auto ${PINK_TEXT}`} size={22} />
              <div className="text-[11px] font-black uppercase mt-2 leading-tight">{s.big}</div>
              <div className={`text-[11px] font-black uppercase ${PINK_TEXT} leading-tight`}>{s.small}</div>
              <div className="text-[8px] font-bold text-muted-foreground uppercase mt-1">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* ORDER FORM */}
        <div className="bg-card rounded-3xl p-5 shadow-xl border-4 border-[hsl(330,85%,75%)] space-y-4">
          <div className="text-center space-y-1">
            <div className={`inline-flex items-center gap-1 ${PINK} text-white text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full`}>
              <Sparkles size={12} /> Закажи ролик
            </div>
            <h2 className="text-2xl font-black">
              Оставьте <span className={PINK_TEXT}>заявку</span>
            </h2>
            <p className="text-[11px] text-muted-foreground font-semibold">
              Свяжемся в течение 15 минут и обсудим вашу задачу
            </p>
          </div>

          {submitted ? (
            <div className="flex flex-col items-center gap-2 py-6">
              <CheckCircle2 size={48} className={PINK_TEXT} />
              <div className="font-black text-lg">Заявка получена!</div>
              <div className="text-xs text-muted-foreground text-center">
                Мы свяжемся с вами очень скоро 💖
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <Input
                placeholder="Ваше имя"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                required
                className="h-12 rounded-xl border-2 border-[hsl(330,85%,85%)] focus-visible:ring-[hsl(330,85%,55%)]"
              />
              <Input
                placeholder="Название бренда / компании"
                value={form.brand}
                onChange={e => setForm({ ...form, brand: e.target.value })}
                required
                className="h-12 rounded-xl border-2 border-[hsl(330,85%,85%)] focus-visible:ring-[hsl(330,85%,55%)]"
              />
              <Input
                placeholder="Telegram / телефон"
                value={form.contact}
                onChange={e => setForm({ ...form, contact: e.target.value })}
                required
                className="h-12 rounded-xl border-2 border-[hsl(330,85%,85%)] focus-visible:ring-[hsl(330,85%,55%)]"
              />
              <Textarea
                placeholder="Кратко опишите задачу (необязательно)"
                value={form.task}
                onChange={e => setForm({ ...form, task: e.target.value })}
                className="rounded-xl border-2 border-[hsl(330,85%,85%)] focus-visible:ring-[hsl(330,85%,55%)] min-h-[80px]"
              />
              <Button
                type="submit"
                className={`w-full h-14 rounded-2xl ${PINK} hover:opacity-90 text-white font-black uppercase text-sm shadow-lg`}
              >
                <TrendingUp size={18} /> Получить охваты
              </Button>
              <p className="text-[9px] text-muted-foreground text-center font-semibold">
                Нажимая кнопку, вы соглашаетесь на обработку данных
              </p>
            </form>
          )}
        </div>

        {/* HOW IT WORKS */}
        <div className="bg-card rounded-3xl border-2 border-[hsl(330,85%,85%)] shadow-md overflow-hidden">
          <button
            onClick={() => setShowHow(v => !v)}
            className={`w-full flex items-center justify-between p-4 ${PINK_SOFT} font-black text-sm uppercase`}
          >
            <span className="flex items-center gap-2">
              <Lightbulb size={18} className={PINK_TEXT} /> Как это работает
            </span>
            <ChevronDown
              size={20}
              className={`${PINK_TEXT} transition-transform ${showHow ? 'rotate-180' : ''}`}
            />
          </button>
          {showHow && (
            <div className="p-5 space-y-4 text-sm">
              {[
                {
                  n: '1',
                  title: 'Вы оставляете задание',
                  text: 'Описываете бренд, продукт и формат — что нужно снять или смонтировать.',
                },
                {
                  n: '2',
                  title: 'Люди присылают вам исходники',
                  text: 'Подписчики и креаторы предоставляют материалы и видео для нарезки.',
                },
                {
                  n: '3',
                  title: 'Мы публикуем задание для нарезчиков',
                  text: 'Десятки наших нарезчиков берут задание и делают ролики под ваш бренд.',
                },
                {
                  n: '4',
                  title: 'Ролик набирает просмотры',
                  text: 'Чем больше просмотров — тем выше гонорар нарезчика. Они мотивированы делать вирусные видео.',
                },
                {
                  n: '5',
                  title: 'Вы получаете охваты и продажи',
                  text: 'Десятки роликов работают на ваш бренд 24/7.',
                },
              ].map(s => (
                <div key={s.n} className="flex gap-3">
                  <div className={`${PINK} text-white w-8 h-8 rounded-full flex items-center justify-center font-black text-sm shrink-0 shadow`}>
                    {s.n}
                  </div>
                  <div>
                    <div className="font-black text-[13px] leading-tight">{s.title}</div>
                    <div className="text-[12px] text-muted-foreground font-semibold mt-1 leading-relaxed">
                      {s.text}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="text-center text-[10px] text-muted-foreground font-bold pt-2">
          💖 Снимаем · Монтируем · Продвигаем 💖
        </div>
      </div>
    </div>
  );
};

export default ReelsLanding;
