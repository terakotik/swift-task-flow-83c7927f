import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, ArrowLeft, Info, LogOut, CheckCircle, Clock, Package, Settings, Wallet, X, Copy as CopyIcon, XCircle, Gift, Users, Share2, AlertTriangle, ChevronRight, Layers } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';
import { WalletPanel } from '@/components/WalletPanel';
import { OffersPanel } from '@/components/OffersPanel';

type Task = Tables<'tasks'>;

interface CompletedTaskWithDetails {
  id: string;
  order_number: string;
  status: string;
  created_at: string;
  task_id: string;
  reject_reason?: string | null;
  tasks: { name: string; task_id: string } | null;
}

function NewOrTimeBadge({ createdAt }: { createdAt: string }) {
  const [label, setLabel] = useState('');
  useEffect(() => {
    const update = () => {
      const diff = Date.now() - new Date(createdAt).getTime();
      if (diff < 60000) {
        setLabel('🆕 Новое');
      } else {
        const d = new Date(createdAt);
        setLabel(d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
      }
    };
    update();
    const id = setInterval(update, 10000);
    return () => clearInterval(id);
  }, [createdAt]);
  const isNew = label.includes('Новое');
  return (
    <span className={`text-[9px] font-black uppercase ${isNew ? 'text-accent' : 'text-muted-foreground'}`}>
      {label}
    </span>
  );
}

function TimerBadge({ expiresAt }: { expiresAt: string }) {
  const [timeLeft, setTimeLeft] = useState('');
  useEffect(() => {
    const update = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft('Истекло'); return; }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${m}:${s.toString().padStart(2, '0')}`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return (
    <div className="bg-warning/10 rounded-xl py-2 px-3 text-center mt-2">
      <p className="text-[9px] font-bold text-warning/70 uppercase tracking-wider">Задание будет снято через</p>
      <p className="text-xl font-black text-warning">⏱ {timeLeft}</p>
    </div>
  );
}

const DEMO_TASKS: Task[] = [
  {
    id: 'demo-1',
    task_id: 'YE-100245',
    name: 'Якитория · Москва, Тверская',
    addr1: 'Москва, ул. Тверская, 12',
    addr2: 'Москва, ул. Арбат, 24',
    link: 'https://eda.yandex.ru',
    status: 'available',
    created_at: new Date(Date.now() - 30000).toISOString(),
    expires_at: new Date(Date.now() + 15 * 60000).toISOString(),
    created_by: null,
    image_url: null,
    task_type: 'text',
    restaurant_tag: null,
    description: null,
    reference_link: null,
  },
  {
    id: 'demo-2',
    task_id: 'YE-100312',
    name: 'Суши Wok · Санкт-Петербург',
    addr1: 'СПб, Невский пр., 45',
    addr2: 'СПб, ул. Рубинштейна, 7',
    link: 'https://eda.yandex.ru',
    status: 'available',
    created_at: new Date(Date.now() - 120000).toISOString(),
    expires_at: null,
    created_by: null,
    image_url: null,
    task_type: 'text',
    restaurant_tag: null,
    description: null,
    reference_link: null,
  },
  {
    id: 'demo-3',
    task_id: 'YE-100478',
    name: 'Тануки · Москва, Юг',
    addr1: 'Москва, Каширское ш., 26',
    addr2: 'Москва, ул. Профсоюзная, 50',
    link: 'https://eda.yandex.ru',
    status: 'available',
    created_at: new Date(Date.now() - 600000).toISOString(),
    expires_at: new Date(Date.now() + 8 * 60000).toISOString(),
    created_by: null,
    image_url: null,
    task_type: 'text',
    restaurant_tag: null,
    description: null,
    reference_link: null,
  },
];

interface Props {
  demoMode?: boolean;
  onExitDemo?: () => void;
  demoFooter?: React.ReactNode;
  hideExitDemo?: boolean;
}

export default function ExecutorDashboard({ demoMode = false, onExitDemo, demoFooter, hideExitDemo = false }: Props) {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [currentTask, setCurrentTask] = useState<Task | null>(null);
  const [orderInput, setOrderInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showInstruction, setShowInstruction] = useState(false);
  const [balance, setBalance] = useState(0);
  const [displayName, setDisplayName] = useState<string>('');
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [myCompleted, setMyCompleted] = useState<CompletedTaskWithDetails[]>([]);
  const [activeTab, setActiveTab] = useState<'available' | 'history'>('available');
  const [showSettings, setShowSettings] = useState(false);
  const [showReferral, setShowReferral] = useState(false);
  const [referralCode, setReferralCode] = useState<string>('');
  const [referralStats, setReferralStats] = useState<{ count: number; earned: number }>({ count: 0, earned: 0 });
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<'Нет соуса' | 'Нет налички' | 'Платная доставка' | ''>('');
  const [sendingIssue, setSendingIssue] = useState(false);
  const [balanceHistory, setBalanceHistory] = useState<Array<{ id: string; delta: number; reason: string | null; created_at: string; new_balance: number }>>([]);
  const [showWallet, setShowWallet] = useState(false);
  const [showOffers, setShowOffers] = useState(false);
  const [hasPendingPayout, setHasPendingPayout] = useState(false);
  const [reelsSubmitted, setReelsSubmitted] = useState(false);
  const TELEGRAM_ADMIN = 'https://t.me/brusnika_s';

  useEffect(() => {
    if (!demoMode) return;
    setTasks(DEMO_TASKS);
    setBalance(130);
    setDisplayName('Демо-исполнитель');
  }, [demoMode]);

  useEffect(() => {
    if (demoMode || !user) return;
    loadTasks();
    loadProfile();
    loadCompletedTasks();
  }, [user, demoMode]);

  // Realtime: notify user when admin updates their balance
  useEffect(() => {
    if (demoMode || !user) return;
    const channel = supabase
      .channel(`profile-balance-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const oldBalance = Number((payload.old as any)?.balance ?? 0);
          const newBalance = Number((payload.new as any)?.balance ?? 0);
          const delta = newBalance - oldBalance;
          setBalance(newBalance);
          if (delta > 0) {
            toast({
              title: `💰 +${delta}₽ зачислено!`,
              description: `Новый баланс: ${newBalance}₽`,
            });
          } else if (delta < 0) {
            toast({
              title: `${delta}₽ списано`,
              description: `Новый баланс: ${newBalance}₽`,
              variant: 'destructive',
            });
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, demoMode, toast]);

  const loadTasks = async () => {
    const now = new Date().toISOString();
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('status', 'available')
      .order('created_at', { ascending: false });
    // Filter out expired tasks client-side
    const active = (data ?? []).filter(t => !t.expires_at || t.expires_at > now);
    setTasks(active);
  };

  const loadProfile = async () => {
    if (!user) return;
    const { data } = await supabase.from('profiles').select('balance, display_name, referral_code').eq('user_id', user.id).single();
    if (data) {
      setBalance(data.balance);
      setDisplayName(data.display_name ?? '');
      setReferralCode((data as any).referral_code ?? '');
    }
    // Реферальная статистика
    const { data: rewards } = await supabase
      .from('referral_rewards')
      .select('amount')
      .eq('referrer_id', user.id);
    if (rewards) {
      setReferralStats({
        count: rewards.length,
        earned: rewards.reduce((s, r: any) => s + Number(r.amount), 0),
      });
    }

    // Активная заявка на выплату
    const { count: pendingCount } = await (supabase as any)
      .from('payout_requests')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'pending');
    setHasPendingPayout((pendingCount ?? 0) > 0);
  };

  const loadCompletedTasks = async () => {
    if (!user) return;
    const [{ data }, { data: bh }] = await Promise.all([
      supabase
        .from('completed_tasks')
        .select('id, order_number, status, created_at, task_id, reject_reason, tasks(name, task_id)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('balance_history')
        .select('id, delta, reason, created_at, new_balance')
        .eq('user_id', user.id)
        .not('reason', 'is', null)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);
    if (data) {
      // Видео-задания (reels / video_edit) не блокируем — их можно выполнять много раз
      const blockedTaskIds = (data as any[])
        .filter(d => {
          const tt = (d as any).tasks?.task_type;
          // task_type не выбрано выше — фильтруем отдельно ниже через tasks карту
          return true;
        })
        .map(d => d.task_id);
      // Получаем типы заданий из текущего списка tasks
      const taskTypeMap = new Map(tasks.map(t => [t.id, t.task_type]));
      const filteredIds = blockedTaskIds.filter(id => {
        const tt = taskTypeMap.get(id);
        return tt !== 'reels' && tt !== 'video_edit';
      });
      setCompletedIds(new Set(filteredIds));
      setMyCompleted(data as any);
    }
    setBalanceHistory((bh as any) ?? []);
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Скопировано!' });
  };

  const finishTask = async () => {
    if (submitting) return;
    if (!currentTask || orderInput.trim().length < 3) return;
    if (demoMode) {
      setCompletedIds(prev => new Set(prev).add(currentTask.id));
      setCurrentTask(null);
      setOrderInput('');
      toast({ title: 'Демо: задание отправлено на проверку!' });
      return;
    }
    if (!user) return;
    setSubmitting(true);
    const { error } = await supabase.from('completed_tasks').insert({
      task_id: currentTask.id,
      user_id: user.id,
      order_number: orderInput.trim(),
    });
    if (error) {
      setSubmitting(false);
      const isDup = error.code === '23505' || /duplicate|unique/i.test(error.message);
      toast({
        title: isDup ? 'Заявка уже отправлена' : 'Ошибка',
        description: isDup ? 'Эта заявка по этому заказу уже на проверке.' : error.message,
        variant: 'destructive',
      });
      return;
    }
    setCompletedIds(prev => new Set(prev).add(currentTask.id));
    setCurrentTask(null);
    setOrderInput('');
    setSubmitting(false);
    loadCompletedTasks();
    toast({ title: 'Задание отправлено на проверку!' });
  };

  const submitIssueReport = async () => {
    if (!currentTask || !selectedIssue || !user || sendingIssue) return;

    setSendingIssue(true);
    const { error } = await (supabase as any).from('order_issue_reports').insert({
      user_id: user.id,
      task_id: currentTask.id,
      problem_type: selectedIssue,
    });

    setSendingIssue(false);

    if (error) {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
      return;
    }

    setShowIssueModal(false);
    setSelectedIssue('');
    toast({ title: 'Проблема отправлена админу' });
  };

  const availableTasks = tasks.filter(t => !completedIds.has(t.id));

  const statusLabel = (s: string) => {
    if (s === 'pending') return { text: 'На проверке', icon: <Clock size={14} className="text-warning" />, color: 'text-warning' };
    if (s === 'accepted') return { text: 'Принят', icon: <Package size={14} className="text-primary" />, color: 'text-primary' };
    if (s === 'rejected') return { text: 'Отклонено', icon: <XCircle size={14} className="text-destructive" />, color: 'text-destructive' };
    return { text: '+20₽ зачислено', icon: <CheckCircle size={14} className="text-accent" />, color: 'text-accent' };
  };

  const submitReels = async () => {
    if (submitting || !currentTask) return;
    if (demoMode) {
      setReelsSubmitted(true);
      return;
    }
    if (!user) return;
    // Задания на монтаж видео не отправляем на проверку админу
    if (currentTask.task_type === 'video_edit') {
      setReelsSubmitted(true);
      return;
    }
    setSubmitting(true);
    const orderNumber = 'reels-' + Date.now().toString(36);
    const { error } = await supabase.from('completed_tasks').insert({
      task_id: currentTask.id,
      user_id: user.id,
      order_number: orderNumber,
    });
    setSubmitting(false);
    if (error) {
      const isDup = error.code === '23505' || /duplicate|unique/i.test(error.message);
      toast({
        title: isDup ? 'Уже отправлено' : 'Ошибка',
        description: isDup ? 'Это задание уже на проверке.' : error.message,
        variant: 'destructive',
      });
      return;
    }
    // Видео-задания (reels / video_edit) можно выполнять многократно — НЕ помечаем как завершённое
    setReelsSubmitted(true);
    loadCompletedTasks();
  };

  if (currentTask) {
    const isReels = currentTask.task_type === 'reels';
    const isVideoEdit = currentTask.task_type === 'video_edit';
    const isVideoTask = isReels || isVideoEdit;
    const isImage = currentTask.task_type === 'image' && currentTask.image_url;

    if (isVideoTask) {
      const desc = (currentTask as any).description as string | null;
      const refLink = (currentTask as any).reference_link as string | null;
      const taskLabel = isVideoEdit ? '🎞️ Монтаж видео' : '🎬 Рилс';
      const rewardLabel = '200₽ + бонус за просмотры';
      const sectionLabel = isVideoEdit ? 'Что нужно смонтировать' : 'Что нужно снять / смонтировать';

      // Простой markdown: **bold**, переносы строк сохраняются через whitespace-pre-wrap
      const renderMd = (text: string) => {
        const parts = text.split(/(\*\*[^*]+\*\*)/g);
        return parts.map((p, i) => {
          if (/^\*\*[^*]+\*\*$/.test(p)) {
            return <strong key={i} className="font-black text-foreground">{p.slice(2, -2)}</strong>;
          }
          return <span key={i}>{p}</span>;
        });
      };
      return (
        <div className="max-w-md mx-auto min-h-screen p-4 space-y-4">
          <button
            onClick={() => { setCurrentTask(null); setReelsSubmitted(false); }}
            className="flex items-center gap-2 text-primary font-bold text-sm"
          >
            <ArrowLeft size={18} /> Назад к списку
          </button>

          {!reelsSubmitted ? (
            <div className="bg-card rounded-3xl shadow-lg border border-border overflow-hidden">
              {/* Hero — мотивация заработать */}
              <div className="relative p-5 bg-gradient-to-br from-warning via-accent to-primary text-primary-foreground overflow-hidden">
                <div className="absolute -top-10 -right-10 w-40 h-40 bg-background/10 rounded-full blur-2xl" />
                <div className="relative space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-black uppercase tracking-widest bg-background/25 backdrop-blur px-2 py-1 rounded-full">
                      {taskLabel}
                    </span>
                    <span className="text-[10px] font-black bg-background/25 backdrop-blur px-2 py-1 rounded-full">
                      {rewardLabel}
                    </span>
                  </div>
                  <h2 className="text-2xl font-black leading-tight">{currentTask.name}</h2>
                  <div className="flex items-end gap-2">
                    <span className="text-5xl font-black leading-none">200₽</span>
                    <span className="text-xs font-bold opacity-90 pb-1">базовая оплата</span>
                  </div>
                  <div className="bg-background/15 backdrop-blur rounded-2xl p-3 space-y-1 text-[11px] font-bold">
                    <div className="flex items-center gap-2">🔥 <span>+200₽ за каждые <strong>5 000 просмотров</strong></span></div>
                    <div className="opacity-80 pt-1">Чем больше просмотров — тем больше заработок 🚀</div>
                  </div>
                  <span className="text-[9px] bg-background/15 px-2 py-1 rounded font-black inline-block uppercase tracking-wider break-all">
                    ID: {currentTask.task_id}
                  </span>
                </div>
              </div>

              <div className="p-5 space-y-5">
                {desc && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-primary uppercase tracking-widest">{sectionLabel}</label>
                    <div className="rounded-2xl bg-muted/60 border border-border p-4 text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                      {renderMd(desc)}
                    </div>
                  </div>
                )}

                {refLink && (
                  <a
                    href={refLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center w-full gap-3 bg-primary text-primary-foreground font-black py-4 rounded-2xl shadow-sm active:scale-95 transition-transform text-sm uppercase"
                  >
                    Открыть референс / исходники
                  </a>
                )}

                <div className="rounded-2xl bg-accent/10 border border-accent/30 p-4 text-[12px] font-bold text-foreground/90 leading-relaxed space-y-1">
                  <div className="text-[10px] font-black uppercase tracking-widest text-accent mb-1">Как платим</div>
                  <div>💰 <span className="text-accent font-black">200₽</span> за видеоролик</div>
                  <div>🔥 <span className="text-warning font-black">+200₽</span> за каждые <strong>5 000 просмотров</strong></div>
                </div>

                <Button
                  onClick={submitReels}
                  disabled={submitting}
                  className="w-full font-black uppercase bg-foreground text-background hover:bg-foreground/90 disabled:opacity-60 h-14 rounded-2xl text-base shadow-lg"
                >
                  {submitting ? 'Отправка...' : 'Готово'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="bg-card rounded-3xl p-6 shadow-sm border border-border space-y-5 text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center text-accent">
                <CheckCircle size={36} />
              </div>
              <div>
                <h3 className="text-xl font-black text-foreground">
                  {isVideoEdit ? 'Отправьте смонтированное видео' : 'Отправьте видео на модерацию'}
                </h3>
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                  Перешлите готовое видео админу в Telegram. Укажите ID задания: <span className="font-black text-foreground">{currentTask.task_id}</span>
                </p>
              </div>
              <a
                href={TELEGRAM_ADMIN}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center w-full gap-2 bg-primary text-primary-foreground font-black py-4 rounded-2xl shadow-sm active:scale-95 transition-transform text-sm uppercase"
              >
                Написать админу в Telegram
              </a>
              <p className="text-[10px] text-muted-foreground font-bold leading-relaxed">
                После модерации админ начислит <span className="text-accent font-black">200₽</span> на ваш баланс.
                <br />За каждые <span className="text-warning font-black">5 000 просмотров</span> — ещё <span className="text-warning font-black">+200₽</span> (пришлите статистику админу).
              </p>
              <Button
                variant="outline"
                onClick={() => { setCurrentTask(null); setReelsSubmitted(false); }}
                className="w-full font-black uppercase rounded-2xl h-12"
              >
                Назад к списку
              </Button>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="max-w-md mx-auto min-h-screen p-4 space-y-4">
        <button onClick={() => setCurrentTask(null)} className="flex items-center gap-2 text-primary font-bold text-sm">
          <ArrowLeft size={18} /> Назад к списку
        </button>
        <div className="bg-card rounded-3xl p-6 shadow-sm border border-border space-y-6">
          {isImage ? (
            <>
              <div className="space-y-2">
                <p className="text-[10px] font-black text-primary uppercase tracking-widest">Задание (вся информация на картинке)</p>
                <a href={currentTask.image_url!} target="_blank" rel="noopener noreferrer" className="block">
                  <img
                    src={currentTask.image_url!}
                    alt="Задание"
                    className="w-full rounded-2xl border border-border bg-muted object-contain max-h-[60vh]"
                  />
                </a>
                <p className="text-[10px] text-muted-foreground font-bold text-center">Нажмите на картинку, чтобы открыть в полном размере</p>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-accent uppercase tracking-widest">Адрес доставки</label>
                <div className="flex items-center gap-3">
                  <span className="flex-1 text-foreground text-sm font-bold">{currentTask.addr2}</span>
                  <button onClick={() => copyText(currentTask.addr2 ?? '')} className="shrink-0 p-3 bg-accent/10 rounded-xl text-accent">
                    <Copy size={20} />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                {(() => { const parts = (currentTask.name ?? '').split(' · '); return (<>
                  <h2 className="text-xl font-black text-foreground">{parts[0]}</h2>
                  {parts[1] && <p className="text-xs text-muted-foreground font-bold">{parts[1]}</p>}
                </>); })()}
                <span className="text-[10px] bg-muted px-2 py-1 rounded text-muted-foreground font-black mt-2 inline-block uppercase tracking-wider break-all">
                  ID: {currentTask.task_id}
                </span>
              </div>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-primary uppercase tracking-widest">Адрес ресторана (Пункт А)</label>
                  <div className="flex items-center gap-3">
                    <span className="flex-1 text-foreground text-sm font-bold">{currentTask.addr1}</span>
                    <button onClick={() => copyText(currentTask.addr1 ?? '')} className="shrink-0 p-3 bg-primary/10 rounded-xl text-primary">
                      <Copy size={20} />
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-accent uppercase tracking-widest">Адрес доставки (Пункт Б)</label>
                  <div className="flex items-center gap-3">
                    <span className="flex-1 text-foreground text-sm font-bold">{currentTask.addr2}</span>
                    <button onClick={() => copyText(currentTask.addr2 ?? '')} className="shrink-0 p-3 bg-accent/10 rounded-xl text-accent">
                      <Copy size={20} />
                    </button>
                  </div>
                </div>
                {currentTask.link && (
                  <a
                    href={currentTask.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center w-full gap-3 bg-warning text-warning-foreground font-black py-4 rounded-2xl shadow-sm active:scale-95 transition-transform text-sm"
                  >
                    ПЕРЕЙТИ В ЯНДЕКС ЕДУ
                  </a>
                )}
              </div>
            </>
          )}
          <div className="pt-4 border-t border-border">
            {!demoMode && user && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowIssueModal(true)}
                className="mb-3 w-full font-black uppercase gap-2 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <AlertTriangle size={16} />
                Проблема с заказом
              </Button>
            )}
            <Input
              value={orderInput}
              onChange={e => setOrderInput(e.target.value)}
              placeholder="Введите номер заказа"
              className="mb-3"
            />
            <Button onClick={finishTask} disabled={submitting} className="w-full font-black uppercase bg-foreground text-background hover:bg-foreground/90 disabled:opacity-60">
              {submitting ? 'Отправка...' : 'Завершить задание'}
            </Button>
          </div>
        </div>

        {showIssueModal && !demoMode && user && (
          <div className="fixed inset-0 z-[70]">
            <div className="absolute inset-0 bg-foreground/60 backdrop-blur-sm" onClick={() => setShowIssueModal(false)} />
            <div className="absolute bottom-0 left-0 right-0 mx-auto max-w-md rounded-t-[32px] bg-card p-6 pb-8 shadow-lg animate-in slide-in-from-bottom">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-destructive">Проблема с заказом</p>
                  <h3 className="text-lg font-black text-foreground">Выберите вариант</h3>
                </div>
                <button onClick={() => setShowIssueModal(false)} className="rounded-full bg-muted p-2 text-foreground">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3">
                {(['Нет соуса', 'Нет налички', 'Платная доставка'] as const).map((issue) => {
                  const active = selectedIssue === issue;
                  return (
                    <button
                      key={issue}
                      type="button"
                      onClick={() => setSelectedIssue(issue)}
                      className={`w-full rounded-2xl border px-4 py-4 text-left text-sm font-black transition-colors ${
                        active ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-card text-foreground hover:bg-muted'
                      }`}
                    >
                      {issue}
                    </button>
                  );
                })}
              </div>

              <Button
                type="button"
                onClick={submitIssueReport}
                disabled={!selectedIssue || sendingIssue}
                className="mt-5 w-full font-black uppercase"
              >
                {sendingIssue ? 'Отправка...' : 'Отправить'}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col">
      <header className="bg-card border-b border-border sticky top-0 z-30 shadow-sm">
        <div className="p-5 pb-3">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-xl font-black text-foreground">
              {demoMode ? 'Демо-режим' : 'Мои задания'}
            </h1>
            <div className="flex gap-2">
              <button onClick={() => setShowInstruction(true)} className="p-2 bg-primary/10 text-primary rounded-full">
                <Info size={24} />
              </button>
              {!demoMode && (
                <button onClick={() => setShowOffers(true)} className="p-2 bg-accent/10 text-accent rounded-full" title="Офферы">
                  <Layers size={24} />
                </button>
              )}
              {!demoMode && (
                <button onClick={() => setShowSettings(true)} className="p-2 bg-muted text-foreground rounded-full">
                  <Settings size={24} />
                </button>
              )}
              {!hideExitDemo && (
                demoMode ? (
                  onExitDemo && (
                    <button onClick={onExitDemo} className="p-2 bg-destructive/10 text-destructive rounded-full">
                      <LogOut size={24} />
                    </button>
                  )
                ) : (
                  <button onClick={signOut} className="p-2 bg-destructive/10 text-destructive rounded-full">
                    <LogOut size={24} />
                  </button>
                )
              )}
            </div>
          </div>

          {/* Balance Card — открывает кошелёк */}
          {!demoMode ? (
            <button
              type="button"
              onClick={() => setShowWallet(true)}
              className="w-full bg-accent/10 hover:bg-accent/15 rounded-2xl p-4 flex items-center justify-between mb-3 active:scale-[0.99] transition-all border border-accent/20 text-left"
            >
              <div>
                <p className="text-[10px] font-black text-accent uppercase tracking-widest flex items-center gap-1">
                  <Wallet size={11} /> Мой кошелёк
                </p>
                <p className="text-3xl font-black text-accent">{balance}₽</p>
                {hasPendingPayout && (
                  <p className="text-[9px] font-black text-warning uppercase mt-0.5">⏳ Заявка в обработке</p>
                )}
              </div>
              <div className="text-right flex items-center gap-2">
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Активно заданий</p>
                  <p className="text-2xl font-black text-foreground">{availableTasks.length}</p>
                </div>
                <ChevronRight className="text-muted-foreground" size={20} />
              </div>
            </button>
          ) : (
            <div className="bg-accent/10 rounded-2xl p-4 flex items-center justify-between mb-3">
              <div>
                <p className="text-[10px] font-black text-accent uppercase tracking-widest">Ваш баланс</p>
                <p className="text-3xl font-black text-accent">{balance}₽</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Активных заданий</p>
                <p className="text-2xl font-black text-foreground">{availableTasks.length}</p>
              </div>
            </div>
          )}

          {/* Кнопка "Привести друга" — только для авторизованных, не в демо */}
          {!demoMode && (
            <button
              onClick={() => setShowReferral(true)}
              className="w-full bg-gradient-to-r from-primary to-accent text-primary-foreground rounded-2xl px-4 py-3 flex items-center justify-between gap-3 active:scale-[0.98] transition-transform shadow-sm"
            >
              <div className="flex items-center gap-2">
                <Gift size={20} />
                <span className="text-xs font-black uppercase tracking-wider">Привести друга за деньги</span>
              </div>
              {referralStats.count > 0 && (
                <span className="text-[10px] font-black bg-background/20 px-2 py-1 rounded-full">
                  +{referralStats.earned}₽ · {referralStats.count}
                </span>
              )}
            </button>
          )}
        </div>
        {!demoMode && (
          <div className="flex gap-2 px-5 pb-4">
            <button
              onClick={() => setActiveTab('available')}
              className={`flex-1 py-2 rounded-xl text-xs font-black uppercase ${activeTab === 'available' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
            >
              Задания
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 py-2 rounded-xl text-xs font-black uppercase ${activeTab === 'history' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
            >
              Мои выполненные
            </button>
          </div>
        )}
      </header>

      <main className="p-4 space-y-3">
        {(demoMode || activeTab === 'available') && (
          <>
            {availableTasks.length === 0 && (
              <p className="text-center text-muted-foreground py-12">Нет доступных заданий</p>
            )}
            {availableTasks.map(task => {
              const hasTimer = !!task.expires_at;
              const isImage = task.task_type === 'image' && task.image_url;
              const isReels = task.task_type === 'reels';
              const isVideoEdit = task.task_type === 'video_edit';
              const isVideoTask = isReels || isVideoEdit;
              return (
                <div
                  key={task.id}
                  className="task-card bg-card p-5 rounded-2xl border border-border shadow-sm flex justify-between items-center cursor-pointer active:scale-[0.98] transition-transform"
                  onClick={() => { setReelsSubmitted(false); setCurrentTask(task); }}
                >
                  <div className="flex-1 pr-4 flex gap-3 items-center min-w-0">
                    {isImage && (
                      <img
                        src={task.image_url!}
                        alt=""
                        className="w-14 h-14 rounded-xl object-cover bg-muted shrink-0"
                      />
                    )}
                    {isVideoTask && (
                      <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-warning/30 to-primary/30 flex items-center justify-center text-warning shrink-0 text-2xl">
                        {isVideoEdit ? '🎞️' : '🎬'}
                      </div>
                    )}
                    <div className="min-w-0">
                      {isVideoTask ? (
                        <>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-warning/15 text-warning">
                              {isVideoEdit ? '🎞️ Монтаж · 200₽' : '🎬 Рилс · 200₽'}
                            </span>
                            <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-accent/15 text-accent">
                              +200₽ / 5K 👁
                            </span>
                          </div>
                          <h3 className="font-black text-foreground text-sm uppercase mt-1">{task.name}</h3>
                          <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-tight break-all">ID: {task.task_id}</p>
                        </>
                      ) : isImage ? (
                        <>
                          <h3 className="font-black text-foreground text-sm uppercase">Задание с картинкой</h3>
                          <p className="text-[10px] text-muted-foreground font-bold truncate">→ {task.addr2}</p>
                        </>
                      ) : (
                        <>
                          <h3 className="font-black text-foreground text-sm uppercase">{(task.name ?? '').split(' · ')[0]}</h3>
                          {(task.name ?? '').includes(' · ') && <p className="text-[10px] text-muted-foreground font-bold">{task.name!.split(' · ')[1]}</p>}
                          <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-tight break-all">ID: {task.task_id}</p>
                        </>
                      )}
                      <NewOrTimeBadge createdAt={task.created_at} />
                      {hasTimer && (
                        <TimerBadge expiresAt={task.expires_at!} />
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] font-black uppercase px-2 py-1 rounded-md bg-primary/10 text-primary shrink-0">
                    Начать
                  </span>
                </div>
              );
            })}
          </>
        )}

        {!demoMode && activeTab === 'history' && (
          <>
            {myCompleted.length === 0 && (
              <p className="text-center text-muted-foreground py-12">Нет выполненных заданий</p>
            )}
            {myCompleted.map(ct => {
              const s = statusLabel(ct.status);
              const taskName = ct.tasks?.name ?? 'Задание';
              const nameParts = taskName.split(' · ');
              const isRejected = ct.status === 'rejected';
              return (
                <div
                  key={ct.id}
                  className={`p-5 rounded-2xl border shadow-sm space-y-2 ${
                    ct.status === 'done'
                      ? 'bg-card border-accent/30'
                      : isRejected
                        ? 'bg-destructive/10 border-destructive/40'
                        : 'bg-card border-border'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 pr-3">
                      <h3 className="font-black text-foreground text-sm uppercase">{nameParts[0]}</h3>
                      {nameParts[1] && <p className="text-[10px] text-muted-foreground font-bold">{nameParts[1]}</p>}
                      <p className="text-[9px] text-muted-foreground font-bold">Заказ: {ct.order_number}</p>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <div className="flex items-center gap-1">
                        {s.icon}
                        <span className={`text-[10px] font-black uppercase ${s.color}`}>{s.text}</span>
                      </div>
                      {ct.status === 'done' && (
                        <span className="text-lg font-black text-accent">+20₽</span>
                      )}
                    </div>
                  </div>
                  {isRejected && ct.reject_reason && (
                    <div className="bg-destructive/15 rounded-xl p-3 border border-destructive/30">
                      <p className="text-[10px] font-black text-destructive uppercase tracking-widest mb-1">Причина отклонения</p>
                      <p className="text-foreground text-xs font-bold">{ct.reject_reason}</p>
                    </div>
                  )}
                </div>
              );
            })}

            {balanceHistory.length > 0 && (
              <>
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest pt-4 pb-1">
                  Корректировки баланса от админа
                </p>
                {balanceHistory.map(bh => {
                  const positive = Number(bh.delta) > 0;
                  return (
                    <div
                      key={bh.id}
                      className={`p-4 rounded-2xl border shadow-sm ${positive ? 'bg-accent/5 border-accent/30' : 'bg-destructive/5 border-destructive/30'}`}
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-black text-foreground">
                            {bh.reason || 'Без пояснения'}
                          </p>
                          <p className="text-[10px] text-muted-foreground font-bold mt-1">
                            {new Date(bh.created_at).toLocaleString('ru-RU')} • Баланс стал {Number(bh.new_balance)}₽
                          </p>
                        </div>
                        <span className={`text-lg font-black shrink-0 ${positive ? 'text-accent' : 'text-destructive'}`}>
                          {positive ? '+' : ''}{Number(bh.delta)}₽
                        </span>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}
      </main>

      {demoFooter && (
        <div className="p-4 pb-8 mt-auto">
          {demoFooter}
        </div>
      )}

      {/* Wallet Panel (CPA-style) */}
      {showWallet && user && (
        <WalletPanel
          userId={user.id}
          balance={balance}
          onClose={() => setShowWallet(false)}
          onBalanceChanged={() => { loadProfile(); }}
        />
      )}

      {/* Offers Panel */}
      {showOffers && <OffersPanel onClose={() => setShowOffers(false)} />}

      {/* Settings Modal */}
      {showSettings && user && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-foreground/60 backdrop-blur-sm" onClick={() => setShowSettings(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-card rounded-t-[40px] p-8 pb-12 animate-in slide-in-from-bottom max-w-md mx-auto">
            <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mb-6" />
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-foreground">Настройки</h2>
              <button onClick={() => setShowSettings(false)} className="p-2 bg-muted rounded-full">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3 mb-6">
              <div className="bg-muted/50 rounded-2xl p-4">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Никнейм</p>
                <p className="text-base font-black text-foreground">{displayName || 'Не указан'}</p>
              </div>

              <div className="bg-muted/50 rounded-2xl p-4">
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">ID пользователя</p>
                    <p className="text-xs font-mono font-bold text-foreground break-all">{user.id}</p>
                  </div>
                  <button
                    onClick={() => copyText(user.id)}
                    className="shrink-0 p-2 bg-primary/10 rounded-xl text-primary"
                  >
                    <CopyIcon size={16} />
                  </button>
                </div>
              </div>

              <div className="bg-accent/10 rounded-2xl p-4">
                <p className="text-[10px] font-black text-accent uppercase tracking-widest mb-1">Баланс</p>
                <p className="text-3xl font-black text-accent">{balance}₽</p>
              </div>
            </div>

            <Button
              onClick={() => {
                setShowSettings(false);
                setShowWallet(true);
              }}
              className="w-full font-black uppercase bg-foreground text-background hover:bg-foreground/90 h-12"
            >
              <Wallet size={18} className="mr-2" />
              Вывести средства
            </Button>
          </div>
        </div>
      )}

      {/* Instruction Modal */}
      {showInstruction && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-foreground/60 backdrop-blur-sm" onClick={() => setShowInstruction(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-card rounded-t-[40px] p-8 pb-12 animate-in slide-in-from-bottom">
            <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mb-8" />
            <h2 className="text-2xl font-black text-foreground mb-6">Инструкция</h2>
            <div className="space-y-4 text-sm text-muted-foreground font-medium">
              <p>1. Вводим адрес А в Яндекс Еде.</p>
              <p>2. Ищем ресторан в поиске.</p>
              <p>3. Выбираем <b className="text-foreground">соус васаби</b>.</p>
              <p>4. Меняем адрес на <b className="text-foreground">адрес Б</b>.</p>
              <p>5. Оплата — <b className="text-foreground">Наличные</b>.</p>
              <p>6. Ждем статус "Доставлен", ставим <b className="text-foreground">5 звезд</b>.</p>
            </div>
            <Button onClick={() => setShowInstruction(false)} className="w-full mt-8 font-black uppercase bg-foreground text-background hover:bg-foreground/90">
              Понятно
            </Button>
          </div>
        </div>
      )}

      {/* Referral Modal */}
      {showReferral && !demoMode && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-foreground/60 backdrop-blur-sm" onClick={() => setShowReferral(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-card rounded-t-[40px] animate-in slide-in-from-bottom max-w-md mx-auto flex flex-col max-h-[90vh]">
            {/* Sticky header */}
            <div className="px-8 pt-6 pb-4 shrink-0">
              <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mb-4" />
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-black text-foreground">Привести друга</h2>
                <button onClick={() => setShowReferral(false)} className="p-2 bg-muted rounded-full">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Scrollable content */}
            <div className="px-8 pb-12 overflow-y-auto overscroll-contain">
              {/* Постоянный буст ставки — главный акцент, наверху */}
              <div className="bg-warning/10 border border-warning/30 rounded-2xl p-4 mb-4">
                <p className="text-[10px] font-black text-warning uppercase tracking-widest mb-2">🔥 Бонус навсегда</p>
                <div className="space-y-1.5 text-xs font-bold text-foreground">
                  <div className="flex justify-between gap-2">
                    <span>1-й друг</span>
                    <span className="text-accent text-right">+3₽ к каждому заданию</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>2-й друг</span>
                    <span className="text-accent text-right">+2₽ к каждому заданию</span>
                  </div>
                  <div className="border-t border-warning/30 pt-1.5 mt-1.5 flex justify-between gap-2 font-black">
                    <span>Итого</span>
                    <span className="text-warning text-right">+5₽ к каждому заказу навсегда</span>
                  </div>
                </div>
              </div>

              {/* Разовый бонус — компактнее, без акцента */}
              <div className="bg-muted/40 rounded-xl p-3 mb-4 flex items-center gap-3">
                <Gift className="text-muted-foreground shrink-0" size={18} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-foreground">+30₽ за друга</p>
                  <p className="text-[10px] text-muted-foreground font-medium">Разово, после первой выплаты друга</p>
                </div>
              </div>

              {referralCode && (
                <>
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">Ваша ссылка</p>
                  <div className="bg-muted/50 rounded-2xl p-3 flex items-center gap-2 mb-3">
                    <span className="flex-1 text-xs font-mono font-bold text-foreground break-all">
                      {window.location.origin}/uzero?ref={referralCode}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <Button
                      onClick={() => copyText(`${window.location.origin}/uzero?ref=${referralCode}`)}
                      className="font-black uppercase bg-primary text-primary-foreground hover:bg-primary/90 h-12 text-xs"
                    >
                      <CopyIcon size={16} className="mr-1" />
                      Скопировать
                    </Button>
                    <Button
                      onClick={async () => {
                        const url = `${window.location.origin}/uzero?ref=${referralCode}`;
                        const text = `Подключайся ко мне в команду — получишь задания за деньги: ${url}`;
                        if (navigator.share) {
                          try {
                            await navigator.share({ title: 'Привет!', text, url });
                          } catch {}
                        } else {
                          copyText(text);
                        }
                      }}
                      className="font-black uppercase bg-accent text-accent-foreground hover:bg-accent/90 h-12 text-xs"
                    >
                      <Share2 size={16} className="mr-1" />
                      Поделиться
                    </Button>
                  </div>

                  <div className="bg-muted/50 rounded-2xl p-4 mb-4">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Ваш код</p>
                    <p className="text-2xl font-black tracking-widest text-foreground">{referralCode}</p>
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="bg-accent/10 rounded-2xl p-4 text-center">
                  <Users className="text-accent mx-auto mb-1" size={20} />
                  <p className="text-2xl font-black text-accent">{referralStats.count}</p>
                  <p className="text-[9px] font-black text-muted-foreground uppercase">Друзей</p>
                </div>
                <div className="bg-primary/10 rounded-2xl p-4 text-center">
                  <Wallet className="text-primary mx-auto mb-1" size={20} />
                  <p className="text-2xl font-black text-primary">{referralStats.earned}₽</p>
                  <p className="text-[9px] font-black text-muted-foreground uppercase">Заработано</p>
                </div>
              </div>

              <div className="text-[11px] text-muted-foreground font-medium space-y-1.5 px-1">
                <p>1. Поделитесь ссылкой с другом</p>
                <p>2. Друг регистрируется по вашей ссылке</p>
                <p>3. Когда друг получит первую выплату — вам автоматически зачислится 30₽</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
