import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LogOut, Trash2, Users, Wallet, RefreshCw, Plus, Minus, RotateCcw, History, X, CheckCircle } from 'lucide-react';

const SUPER_ADMIN_EMAIL = 'vt@admin.com';

interface UserProfile {
  user_id: string;
  display_name: string | null;
  email: string | null;
  balance: number;
  created_at: string;
}

interface UserRole {
  user_id: string;
  role: string;
}

interface Task {
  id: string;
  name: string;
  addr1: string;
  addr2: string;
  created_at: string;
  status: string;
}

interface CompletedTaskRow {
  id: string;
  order_number: string;
  status: string;
  user_id: string;
  task_id: string;
  completed_at: string | null;
  created_at: string;
  tasks: { name: string } | null;
}

export default function SuperAdmin() {
  const { user, loading, isAdmin, signOut } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [adjustAmounts, setAdjustAmounts] = useState<Record<string, string>>({});
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [doneCounts, setDoneCounts] = useState<Record<string, number>>({});
  const [historyUser, setHistoryUser] = useState<UserProfile | null>(null);
  const [historyItems, setHistoryItems] = useState<CompletedTaskRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const isSuperAdmin = user?.email === SUPER_ADMIN_EMAIL;
  const currentUserIsAdmin = !!user && roles.some(role => role.user_id === user.id && role.role === 'admin');
  const canManageTasks = isSuperAdmin && (isAdmin || currentUserIsAdmin);

  useEffect(() => {
    if (isSuperAdmin) loadData();
  }, [isSuperAdmin]);

  const loadData = async () => {
    const [{ data: profilesData, error: profilesError }, { data: rolesData, error: rolesError }, { data: tasksData, error: tasksError }, { data: doneData }] = await Promise.all([
      supabase.from('profiles').select('user_id, display_name, email, balance, created_at').order('created_at', { ascending: false }),
      supabase.from('user_roles').select('user_id, role'),
      supabase.from('tasks').select('id, name, addr1, addr2, created_at, status').order('created_at', { ascending: false }),
      supabase.from('completed_tasks').select('user_id').eq('status', 'done'),
    ]);

    if (profilesError || rolesError || tasksError) {
      toast({ title: 'Ошибка загрузки', description: profilesError?.message || rolesError?.message || tasksError?.message, variant: 'destructive' });
      return;
    }

    setProfiles(profilesData ?? []);
    setRoles(rolesData ?? []);
    setTasks(tasksData ?? []);

    const counts: Record<string, number> = {};
    (doneData ?? []).forEach(d => { counts[d.user_id] = (counts[d.user_id] || 0) + 1; });
    setDoneCounts(counts);
  };

  const openHistory = async (profile: UserProfile) => {
    setHistoryUser(profile);
    setHistoryLoading(true);
    const { data } = await supabase
      .from('completed_tasks')
      .select('id, order_number, status, user_id, task_id, completed_at, created_at, tasks(name)')
      .eq('user_id', profile.user_id)
      .in('status', ['done', 'paid'])
      .order('completed_at', { ascending: false });
    setHistoryItems((data as any) ?? []);
    setHistoryLoading(false);
  };

  const getUserRole = (userId: string) => {
    const r = roles.find(r => r.user_id === userId);
    return r?.role ?? 'user';
  };

  const deleteTask = async (taskId: string) => {
    if (!canManageTasks) {
      toast({ title: 'Нет прав', description: 'Для удаления заданий аккаунту vt@admin.com нужна роль admin.', variant: 'destructive' });
      return;
    }

    const { error } = await supabase.from('tasks').delete().eq('id', taskId);
    if (error) {
      toast({ title: 'Ошибка удаления', description: error.message, variant: 'destructive' });
      return;
    }

    await loadData();
    toast({ title: 'Задание удалено' });
  };

  const deleteAllTasks = async () => {
    if (!confirm('Удалить ВСЕ задания? Это действие необратимо.')) return;
    if (!canManageTasks) {
      toast({ title: 'Нет прав', description: 'Для удаления заданий аккаунту vt@admin.com нужна роль admin.', variant: 'destructive' });
      return;
    }

    const { error } = await supabase.from('tasks').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) {
      toast({ title: 'Ошибка удаления', description: error.message, variant: 'destructive' });
      return;
    }

    await loadData();
    toast({ title: 'Все задания удалены' });
  };

  const resetBalance = async (profile: UserProfile) => {
    if (!isAdmin && !currentUserIsAdmin) {
      toast({ title: 'Нет прав', description: 'Нужна роль admin', variant: 'destructive' });
      return;
    }
    if (Number(profile.balance) === 0) {
      toast({ title: 'Баланс уже 0₽' });
      return;
    }
    if (!confirm(`Провести выплату ${profile.display_name || profile.email || 'пользователя'} на сумму ${profile.balance}₽? Текущий баланс и счётчик закроются, а записи останутся в истории как выплаченные.`)) return;
    setAdjustingId(profile.user_id);
    const { error } = await supabase
      .from('profiles')
      .update({ balance: 0 })
      .eq('user_id', profile.user_id);
    if (!error) {
      // Архивируем закрытые задания (done -> paid), чтобы счётчик и история обнулились
      await supabase
        .from('completed_tasks')
        .update({ status: 'paid' })
        .eq('user_id', profile.user_id)
        .eq('status', 'done');
    }
    setAdjustingId(null);
    if (error) {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
      return;
    }
    setProfiles(prev => prev.map(p => p.user_id === profile.user_id ? { ...p, balance: 0 } : p));
    setDoneCounts(prev => ({ ...prev, [profile.user_id]: 0 }));
    toast({
      title: 'Выплата проведена',
      description: `${profile.display_name || profile.email || 'Пользователь'} • выплата ${profile.balance}₽ зафиксирована`,
    });
  };

  const adjustBalance = async (profile: UserProfile, delta: number) => {
    if (!isAdmin && !currentUserIsAdmin) {
      toast({ title: 'Нет прав', description: 'Нужна роль admin', variant: 'destructive' });
      return;
    }
    const newBalance = Number(profile.balance) + delta;
    if (newBalance < 0) {
      toast({ title: 'Ошибка', description: 'Баланс не может быть отрицательным', variant: 'destructive' });
      return;
    }
    setAdjustingId(profile.user_id);
    const { error } = await supabase
      .from('profiles')
      .update({ balance: newBalance })
      .eq('user_id', profile.user_id);
    setAdjustingId(null);
    if (error) {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
      return;
    }
    setProfiles(prev => prev.map(p => p.user_id === profile.user_id ? { ...p, balance: newBalance } : p));
    setAdjustAmounts(prev => ({ ...prev, [profile.user_id]: '' }));
    toast({
      title: delta > 0 ? `+${delta}₽ начислено` : `${delta}₽ списано`,
      description: `${profile.display_name || profile.email || 'Пользователь'} • новый баланс ${newBalance}₽`,
    });
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err: any) {
      toast({ title: 'Ошибка', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user || !isSuperAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="bg-card rounded-3xl p-8 shadow-lg border border-border">
            <h1 className="text-2xl font-black text-foreground mb-1">Супер-Админ</h1>
            <p className="text-muted-foreground text-sm mb-6">Полный контроль системы</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
              <Input type="password" placeholder="Пароль" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
              <Button type="submit" className="w-full font-bold" disabled={submitting}>
                {submitting ? 'Загрузка...' : 'Войти'}
              </Button>
            </form>
            {user && !isSuperAdmin && (
              <div className="mt-4 text-center">
                <p className="text-destructive text-sm font-semibold mb-2">Нет доступа</p>
                <button onClick={signOut} className="text-sm text-primary font-semibold underline">Выйти</button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const totalBalance = profiles.reduce((sum, p) => sum + p.balance, 0);

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col">
      <header className="bg-card border-b border-border p-5 sticky top-0 z-30 shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <div>
            <h1 className="text-xl font-black text-foreground">Супер-Админ</h1>
            <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Полный контроль</p>
          </div>
          <div className="flex gap-2">
            <button onClick={loadData} className="p-2 bg-primary/10 text-primary rounded-full">
              <RefreshCw size={20} />
            </button>
            <button onClick={signOut} className="p-2 bg-destructive/10 text-destructive rounded-full">
              <LogOut size={24} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-primary/10 rounded-2xl p-3 text-center">
            <Users size={18} className="text-primary mx-auto mb-1" />
            <p className="text-lg font-black text-primary">{profiles.length}</p>
            <p className="text-[8px] font-black text-muted-foreground uppercase">Людей</p>
          </div>
          <div className="bg-accent/10 rounded-2xl p-3 text-center">
            <Wallet size={18} className="text-accent mx-auto mb-1" />
            <p className="text-lg font-black text-accent">{totalBalance}₽</p>
            <p className="text-[8px] font-black text-muted-foreground uppercase">Общий баланс</p>
          </div>
          <div className="bg-warning/10 rounded-2xl p-3 text-center">
            <p className="text-lg font-black text-warning">{tasks.length}</p>
            <p className="text-[8px] font-black text-muted-foreground uppercase">Заданий</p>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-3 pb-20">
        {/* Delete all tasks */}
        <Button onClick={deleteAllTasks} variant="destructive" className="w-full font-black uppercase gap-2 rounded-2xl h-12" disabled={!canManageTasks}>
          <Trash2 size={18} /> Удалить все задания ({tasks.length})
        </Button>
        {!canManageTasks && (
          <p className="text-xs text-destructive font-semibold">Удаление выключено: аккаунту vt@admin.com не выдана роль admin.</p>
        )}

        {/* User list */}
        <h2 className="text-sm font-black text-foreground uppercase tracking-widest pt-2">Все пользователи</h2>
        {profiles.map(p => {
          const role = getUserRole(p.user_id);
          return (
            <div key={p.user_id} className="bg-card p-4 rounded-2xl border border-border shadow-sm space-y-3">
              <div className="flex justify-between items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-black text-foreground text-sm truncate">{p.display_name || 'Без имени'}</p>
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${role === 'admin' ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      {role}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground font-semibold truncate">{p.email || '—'}</p>
                  <p className="text-[9px] text-muted-foreground font-bold">
                    Регистрация: {new Date(p.created_at).toLocaleDateString('ru-RU')}
                  </p>
                </div>
                <div className="text-right ml-2">
                  <p className="text-lg font-black text-accent">{p.balance}₽</p>
                  <p className="text-[9px] font-black text-muted-foreground uppercase mt-0.5">
                    Закрыто: {doneCounts[p.user_id] || 0}
                  </p>
                </div>
              </div>

              <div className="flex gap-2 items-center pt-2 border-t border-border">
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="Сумма ₽"
                  value={adjustAmounts[p.user_id] ?? ''}
                  onChange={e => setAdjustAmounts(prev => ({ ...prev, [p.user_id]: e.target.value }))}
                  className="h-9 text-sm flex-1"
                  disabled={adjustingId === p.user_id}
                />
                <Button
                  size="sm"
                  className="h-9 rounded-xl bg-accent text-accent-foreground hover:bg-accent/90 px-3"
                  disabled={adjustingId === p.user_id || !Number(adjustAmounts[p.user_id])}
                  onClick={() => adjustBalance(p, Math.abs(Number(adjustAmounts[p.user_id]) || 0))}
                >
                  <Plus size={16} />
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-9 rounded-xl px-3"
                  disabled={adjustingId === p.user_id || !Number(adjustAmounts[p.user_id])}
                  onClick={() => adjustBalance(p, -Math.abs(Number(adjustAmounts[p.user_id]) || 0))}
                >
                  <Minus size={16} />
                </Button>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-9 rounded-xl gap-2 font-black uppercase text-xs border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
                  onClick={() => openHistory(p)}
                >
                  <History size={14} /> История ({doneCounts[p.user_id] || 0})
                </Button>
                <Button
                  size="sm"
                  className="flex-1 h-9 rounded-xl gap-2 font-black uppercase text-xs bg-accent text-accent-foreground hover:bg-accent/90"
                  disabled={adjustingId === p.user_id || Number(p.balance) === 0}
                  onClick={() => resetBalance(p)}
                >
                  <RotateCcw size={14} /> Выплата
                </Button>
              </div>
            </div>
          );
        })}
        {profiles.length === 0 && (
          <p className="text-center text-muted-foreground py-8">Нет пользователей</p>
        )}

        {/* Tasks list */}
        <h2 className="text-sm font-black text-foreground uppercase tracking-widest pt-4">Все задания</h2>
        {tasks.map(t => (
          <div key={t.id} className="bg-card p-4 rounded-2xl border border-border shadow-sm">
            <div className="flex justify-between items-start">
              <div className="min-w-0 flex-1">
                <p className="font-black text-foreground text-sm">{t.name}</p>
                <p className="text-[10px] text-muted-foreground font-semibold">{t.addr1}</p>
                <p className="text-[9px] text-muted-foreground">{new Date(t.created_at).toLocaleString('ru-RU')}</p>
              </div>
              <Button onClick={() => deleteTask(t.id)} variant="destructive" size="sm" className="ml-2 rounded-xl h-8 w-8 p-0" disabled={!canManageTasks}>
                <Trash2 size={14} />
              </Button>
            </div>
          </div>
        ))}
        {tasks.length === 0 && (
          <p className="text-center text-muted-foreground py-8">Нет заданий</p>
        )}
      </main>

      {/* History modal */}
      {historyUser && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-foreground/60 backdrop-blur-sm" onClick={() => setHistoryUser(null)} />
          <div className="absolute bottom-0 left-0 right-0 max-h-[85vh] bg-card rounded-t-[40px] p-6 pb-10 animate-in slide-in-from-bottom flex flex-col">
            <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mb-4 shrink-0" />
            <div className="flex justify-between items-start mb-4 shrink-0">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-black text-foreground truncate">
                  {historyUser.display_name || historyUser.email || 'Пользователь'}
                </h2>
                <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">
                  Записей: {historyItems.length} • Баланс {historyUser.balance}₽
                </p>
              </div>
              <button onClick={() => setHistoryUser(null)} className="p-2 bg-muted rounded-full">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto space-y-2 -mx-2 px-2">
              {historyLoading && (
                <p className="text-center text-muted-foreground py-8 text-sm">Загрузка...</p>
              )}
              {!historyLoading && historyItems.length === 0 && (
                <p className="text-center text-muted-foreground py-8 text-sm">
                  История пока пуста
                </p>
              )}
              {historyItems.map(item => {
                const date = item.completed_at || item.created_at;
                const isPaid = item.status === 'paid';
                return (
                  <div key={item.id} className="bg-muted/50 rounded-xl p-3 flex items-center gap-3">
                    <CheckCircle size={18} className={`${isPaid ? 'text-accent' : 'text-warning'} shrink-0`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black text-foreground truncate">
                        {item.tasks?.name || 'Задание'}
                      </p>
                      <p className="text-[10px] text-muted-foreground font-bold">
                        Заказ №{item.order_number} • {new Date(date).toLocaleString('ru-RU')}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`text-[10px] font-black px-2 py-1 rounded-full ${isPaid ? 'bg-accent/10 text-accent' : 'bg-warning/10 text-warning'}`}>
                        {isPaid ? 'Выплачено' : 'К выплате'}
                      </span>
                      <span className="text-sm font-black text-accent">+20₽</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
