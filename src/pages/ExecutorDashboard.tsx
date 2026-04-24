import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, ArrowLeft, Info, LogOut, CheckCircle, Clock, Package, Settings, Wallet, X, Copy as CopyIcon, XCircle, Gift, Users, Share2 } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';

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
    const { data } = await supabase.from('profiles').select('balance, display_name').eq('user_id', user.id).single();
    if (data) {
      setBalance(data.balance);
      setDisplayName(data.display_name ?? '');
    }
  };

  const loadCompletedTasks = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('completed_tasks')
      .select('id, order_number, status, created_at, task_id, reject_reason, tasks(name, task_id)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (data) {
      setCompletedIds(new Set(data.map(d => d.task_id)));
      setMyCompleted(data as any);
    }
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

  const availableTasks = tasks.filter(t => !completedIds.has(t.id));

  const statusLabel = (s: string) => {
    if (s === 'pending') return { text: 'На проверке', icon: <Clock size={14} className="text-warning" />, color: 'text-warning' };
    if (s === 'accepted') return { text: 'Принят', icon: <Package size={14} className="text-primary" />, color: 'text-primary' };
    if (s === 'rejected') return { text: 'Отклонено', icon: <XCircle size={14} className="text-destructive" />, color: 'text-destructive' };
    return { text: '+20₽ зачислено', icon: <CheckCircle size={14} className="text-accent" />, color: 'text-accent' };
  };

  if (currentTask) {
    const isImage = currentTask.task_type === 'image' && currentTask.image_url;
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

          {/* Balance Card */}
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
              return (
                <div
                  key={task.id}
                  className="task-card bg-card p-5 rounded-2xl border border-border shadow-sm flex justify-between items-center cursor-pointer active:scale-[0.98] transition-transform"
                  onClick={() => setCurrentTask(task)}
                >
                  <div className="flex-1 pr-4 flex gap-3 items-center min-w-0">
                    {isImage && (
                      <img
                        src={task.image_url!}
                        alt=""
                        className="w-14 h-14 rounded-xl object-cover bg-muted shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      {isImage ? (
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
          </>
        )}
      </main>

      {demoFooter && (
        <div className="p-4 pb-8 mt-auto">
          {demoFooter}
        </div>
      )}

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
                toast({
                  title: 'Недостаточно баланса для вывода средств',
                  description: 'Минимальная сумма для вывода — 200₽',
                  variant: 'destructive',
                });
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
    </div>
  );
}
