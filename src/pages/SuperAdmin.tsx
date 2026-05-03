import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { LogOut, Trash2, Users, Wallet, RefreshCw, Plus, Minus, RotateCcw, History, X, CheckCircle, Archive, Undo2, Wrench, Film, Pause, Play } from 'lucide-react';
import { AdminPayoutRequests } from '@/components/AdminPayoutRequests';

const SUPER_ADMIN_EMAIL = 'vt@admin.com';

interface UserProfile {
  user_id: string;
  display_name: string | null;
  email: string | null;
  balance: number;
  created_at: string;
  payout_hold?: boolean;
  payout_hold_at?: string | null;
  payout_hold_amount?: number;
  payout_hold_with_image?: number;
  payout_hold_no_image?: number;
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

interface DeletedLogRow {
  id: string;
  original_id: string;
  task_id: string;
  user_id: string;
  order_number: string;
  status: string;
  reject_reason: string | null;
  accepted_at: string | null;
  completed_at: string | null;
  original_created_at: string;
  deleted_at: string;
  deleted_by: string | null;
  restored: boolean;
  restored_at: string | null;
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
  // Открытая партия (held_at IS NULL) — то, что копится сейчас
  const [unpaidOfferStats, setUnpaidOfferStats] = useState<Record<string, { withImage: number; noImage: number }>>({});
  // Замороженная партия (held_at IS NOT NULL) — ждёт выплаты
  const [heldOfferStats, setHeldOfferStats] = useState<Record<string, { withImage: number; noImage: number; heldAt: string | null }>>({});
  const [freezing, setFreezing] = useState(false);
  const [bonusTotals, setBonusTotals] = useState<Record<string, number>>({});
  const [taskEarningTotals, setTaskEarningTotals] = useState<Record<string, number>>({});
  const [weeklyStats, setWeeklyStats] = useState<Array<{ date: string; label: string; withImage: number; noImage: number; total: number; revenue: number }>>([]);
  const [isPayoutDialogOpen, setIsPayoutDialogOpen] = useState(false);
  const [historyUser, setHistoryUser] = useState<UserProfile | null>(null);
  const [historyItems, setHistoryItems] = useState<CompletedTaskRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [deletedLog, setDeletedLog] = useState<DeletedLogRow[]>([]);
  const [logDate, setLogDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [logLoading, setLogLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  // Manual restore form state
  const [mrUserId, setMrUserId] = useState<string>('');
  const [mrTaskId, setMrTaskId] = useState<string>('');
  const [mrStatus, setMrStatus] = useState<'done' | 'paid'>('done');
  const [mrPrice, setMrPrice] = useState<string>('20');
  const [mrOrders, setMrOrders] = useState<string>('');
  const [mrBusy, setMrBusy] = useState(false);
  // Balance adjust dialog
  const [adjustDialog, setAdjustDialog] = useState<{ profile: UserProfile; delta: number } | null>(null);
  const [adjustReason, setAdjustReason] = useState('');
  // Balance history items in user history modal
  const [balanceHistoryItems, setBalanceHistoryItems] = useState<Array<{ id: string; delta: number; reason: string | null; created_at: string; new_balance: number }>>([]);
  // Video edit task form
  const [veName, setVeName] = useState('');
  const [veDesc, setVeDesc] = useState('');
  const [veSource, setVeSource] = useState('');
  const [veRef, setVeRef] = useState('');
  const [veSubmitting, setVeSubmitting] = useState(false);
  // Pending payout requests: user_id -> { id, amount }
  const [pendingPayoutByUser, setPendingPayoutByUser] = useState<Record<string, { id: string; amount: number }>>({});

  const isSuperAdmin = user?.email === SUPER_ADMIN_EMAIL;
  const currentUserIsAdmin = !!user && roles.some(role => role.user_id === user.id && role.role === 'admin');
  const canManageTasks = isSuperAdmin && (isAdmin || currentUserIsAdmin);

  const loadDeletedLog = useCallback(async () => {
    setLogLoading(true);
    const start = new Date(`${logDate}T00:00:00`);
    const end = new Date(`${logDate}T23:59:59.999`);
    const { data, error } = await supabase
      .from('deleted_completed_tasks_log')
      .select('*')
      .gte('deleted_at', start.toISOString())
      .lte('deleted_at', end.toISOString())
      .order('deleted_at', { ascending: false });
    setLogLoading(false);
    if (error) {
      toast({ title: 'Ошибка журнала', description: error.message, variant: 'destructive' });
      return;
    }
    setDeletedLog((data as any) ?? []);
  }, [logDate, toast]);

  const restoreDeleted = async (row: DeletedLogRow) => {
    if (!isAdmin && !currentUserIsAdmin) {
      toast({ title: 'Нет прав', description: 'Нужна роль admin', variant: 'destructive' });
      return;
    }
    setRestoringId(row.id);
    const { data: taskExists } = await supabase
      .from('tasks').select('id').eq('id', row.task_id).maybeSingle();
    if (!taskExists) {
      setRestoringId(null);
      toast({
        title: 'Задание удалено',
        description: 'Невозможно восстановить: исходное задание тоже удалено из базы.',
        variant: 'destructive',
      });
      return;
    }
    const { error: insertErr } = await supabase.from('completed_tasks').insert({
      id: row.original_id,
      task_id: row.task_id,
      user_id: row.user_id,
      order_number: row.order_number,
      status: row.status,
      reject_reason: row.reject_reason,
      accepted_at: row.accepted_at,
      completed_at: row.completed_at,
      created_at: row.original_created_at,
    });
    if (insertErr) {
      setRestoringId(null);
      toast({ title: 'Ошибка восстановления', description: insertErr.message, variant: 'destructive' });
      return;
    }
    await supabase
      .from('deleted_completed_tasks_log')
      .update({ restored: true, restored_at: new Date().toISOString() })
      .eq('id', row.id);
    setRestoringId(null);
    await Promise.all([loadDeletedLog(), loadData()]);
    toast({ title: 'Восстановлено', description: `Заказ №${row.order_number}` });
  };

  const loadData = useCallback(async () => {
    const sinceDate = new Date();
    sinceDate.setHours(0, 0, 0, 0);
    sinceDate.setDate(sinceDate.getDate() - 6);
    const [{ data: profilesData, error: profilesError }, { data: rolesData, error: rolesError }, { data: tasksData, error: tasksError }, { data: completedDone }, { data: balanceHistoryData }, { data: completedWeek }, { data: pendingPayouts }] = await Promise.all([
      supabase.from('profiles').select('user_id, display_name, email, balance, created_at, payout_hold, payout_hold_at, payout_hold_amount, payout_hold_with_image, payout_hold_no_image').order('created_at', { ascending: false }),
      supabase.from('user_roles').select('user_id, role'),
      supabase.from('tasks').select('id, name, addr1, addr2, created_at, status, image_url, task_type').order('created_at', { ascending: false }),
      supabase.from('completed_tasks').select('user_id, task_id').eq('status', 'done'),
      supabase.from('balance_history').select('user_id, delta, reason'),
      supabase.from('completed_tasks').select('task_id, completed_at, status').in('status', ['done', 'paid']).gte('completed_at', sinceDate.toISOString()),
      supabase.from('payout_requests').select('id, user_id, amount').eq('status', 'pending'),
    ]);

    const pendingMap: Record<string, { id: string; amount: number }> = {};
    (pendingPayouts ?? []).forEach((r: any) => {
      pendingMap[r.user_id] = { id: r.id, amount: Number(r.amount) || 0 };
    });
    setPendingPayoutByUser(pendingMap);

    if (profilesError || rolesError || tasksError) {
      toast({ title: 'Ошибка загрузки', description: profilesError?.message || rolesError?.message || tasksError?.message, variant: 'destructive' });
      return;
    }

    setProfiles(profilesData ?? []);
    setRoles(rolesData ?? []);
    setTasks(tasksData ?? []);

    // Разделяем начисления: без пояснения — это выплаты за задания, с пояснением — ручной бонус/корректировка.
    const bonusTotals: Record<string, number> = {};
    const taskEarningTotals: Record<string, number> = {};
    (balanceHistoryData ?? []).forEach((bh: any) => {
      const reason = (bh.reason ?? '').toString().trim();
      const delta = Number(bh.delta) || 0;
      if (delta <= 0) return;
      if (!reason) {
        taskEarningTotals[bh.user_id] = (taskEarningTotals[bh.user_id] || 0) + delta;
        return;
      }
      if (reason.startsWith('referral_bonus:')) return;
      bonusTotals[bh.user_id] = (bonusTotals[bh.user_id] || 0) + delta;
    });
    setBonusTotals(bonusTotals);
    setTaskEarningTotals(taskEarningTotals);

    const counts: Record<string, number> = {};
    (completedDone ?? []).forEach(d => { counts[d.user_id] = (counts[d.user_id] || 0) + 1; });
    setDoneCounts(counts);

    const taskTypeMap: Record<string, 'withImage' | 'noImage'> = {};
    (tasksData ?? []).forEach((t: any) => {
      const isImage = t.task_type === 'image' || !!t.image_url;
      taskTypeMap[t.id] = isImage ? 'withImage' : 'noImage';
    });
    const stats: Record<string, { withImage: number; noImage: number }> = {};
    (completedDone ?? []).forEach((c: any) => {
      const kind = taskTypeMap[c.task_id];
      if (!kind) return;
      if (!stats[c.user_id]) stats[c.user_id] = { withImage: 0, noImage: 0 };
      stats[c.user_id][kind] += 1;
    });
    setUnpaidOfferStats(stats);

    // Weekly stats: per-day completed tasks (last 7 days) + company revenue
    const COMPANY_IMAGE_PRICE = 100;
    const COMPANY_TEXT_PRICE = 70;
    const days: Array<{ date: string; label: string; withImage: number; noImage: number; total: number; revenue: number }> = [];
    const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const weekdays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const buckets: Record<string, { withImage: number; noImage: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = dayKey(d);
      buckets[key] = { withImage: 0, noImage: 0 };
      days.push({
        date: key,
        label: `${weekdays[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`,
        withImage: 0,
        noImage: 0,
        total: 0,
        revenue: 0,
      });
    }
    (completedWeek ?? []).forEach((c: any) => {
      if (!c.completed_at) return;
      const d = new Date(c.completed_at);
      d.setHours(0, 0, 0, 0);
      const key = dayKey(d);
      if (!buckets[key]) return;
      const kind = taskTypeMap[c.task_id];
      if (kind === 'withImage') buckets[key].withImage += 1;
      else if (kind === 'noImage') buckets[key].noImage += 1;
      else buckets[key].noImage += 1;
    });
    days.forEach(day => {
      const b = buckets[day.date];
      day.withImage = b.withImage;
      day.noImage = b.noImage;
      day.total = b.withImage + b.noImage;
      day.revenue = b.withImage * COMPANY_IMAGE_PRICE + b.noImage * COMPANY_TEXT_PRICE;
    });
    setWeeklyStats(days);
  }, [toast]);

  useEffect(() => {
    if (isSuperAdmin) loadData();
  }, [isSuperAdmin, loadData]);

  useEffect(() => {
    if (isSuperAdmin) loadDeletedLog();
  }, [isSuperAdmin, loadDeletedLog]);

  useEffect(() => {
    if (!isSuperAdmin) return;

    const refreshSuperAdminData = () => {
      loadData();
      loadDeletedLog();
    };

    refreshSuperAdminData();

    const refreshInterval = setInterval(refreshSuperAdminData, 10000);
    const handleWindowFocus = () => refreshSuperAdminData();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshSuperAdminData();
    };

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(refreshInterval);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isSuperAdmin, loadData, loadDeletedLog]);

  const openHistory = async (profile: UserProfile) => {
    setHistoryUser(profile);
    setHistoryLoading(true);
    const [{ data }, { data: bh }] = await Promise.all([
      supabase
        .from('completed_tasks')
        .select('id, order_number, status, user_id, task_id, completed_at, created_at, tasks(name)')
        .eq('user_id', profile.user_id)
        .in('status', ['done', 'paid'])
        .order('completed_at', { ascending: false }),
      supabase
        .from('balance_history')
        .select('id, delta, reason, created_at, new_balance')
        .eq('user_id', profile.user_id)
        .not('reason', 'is', null)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);
    setHistoryItems((data as any) ?? []);
    setBalanceHistoryItems((bh as any) ?? []);
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
    const activeDone = doneCounts[profile.user_id] || 0;
    if (Number(profile.balance) === 0 && activeDone === 0) {
      toast({ title: 'Уже обнулено', description: 'Баланс 0₽ и нет заданий к выплате' });
      return;
    }
    const confirmMsg = Number(profile.balance) > 0
      ? `Провести выплату ${profile.display_name || profile.email || 'пользователя'} на сумму ${profile.balance}₽? Текущий баланс и счётчик закроются, а записи останутся в истории как выплаченные.`
      : `Баланс 0₽, но осталось ${activeDone} незакрытых заданий. Архивировать их как выплаченные?`;
    if (!confirm(confirmMsg)) return;
    setAdjustingId(profile.user_id);
    const payoutAmount = Number(profile.balance) || 0;

    // Обнуляем баланс через защищённую RPC (она проверит роль admin и запишет причину в balance_history)
    if (payoutAmount > 0) {
      const { data: adjData, error: adjError } = await supabase.rpc('admin_adjust_balance', {
        _user_id: profile.user_id,
        _delta: -payoutAmount,
        _reason: `Выплата ${payoutAmount}₽`,
      });
      const adj = adjData as any;
      if (adjError || !adj?.ok) {
        setAdjustingId(null);
        toast({
          title: 'Ошибка выплаты',
          description: adjError?.message || adj?.error || 'Не удалось обнулить баланс. Проверьте права admin.',
          variant: 'destructive',
        });
        return;
      }
    }

    // Помечаем все done-задания как paid
    const { error: tasksError } = await supabase
      .from('completed_tasks')
      .update({ status: 'paid' })
      .eq('user_id', profile.user_id)
      .eq('status', 'done');
    if (tasksError) {
      setAdjustingId(null);
      toast({ title: 'Ошибка обновления заданий', description: tasksError.message, variant: 'destructive' });
      return;
    }

    // Реферальная выплата: если у юзера есть пригласивший и это первая выплата — начислить 30₽
    const { data: refRes } = await supabase.rpc('process_referral_payout', { _user_id: profile.user_id });
    const r = refRes as any;
    if (r?.ok && r?.rewarded) {
      toast({
        title: '🎁 Реферальный бонус начислен',
        description: `Пригласившему +${r.amount}₽ за приведённого друга`,
      });
    }

    // Сбрасываем холд, если был
    if (profile.payout_hold) {
      await supabase.from('profiles').update({
        payout_hold: false,
        payout_hold_at: null,
        payout_hold_amount: 0,
        payout_hold_with_image: 0,
        payout_hold_no_image: 0,
      }).eq('user_id', profile.user_id);
    }

    setAdjustingId(null);
    setProfiles(prev => prev.map(p => p.user_id === profile.user_id ? { ...p, balance: 0, payout_hold: false } : p));
    setDoneCounts(prev => ({ ...prev, [profile.user_id]: 0 }));
    await loadData();
    toast({
      title: 'Выплата проведена',
      description: `${profile.display_name || profile.email || 'Пользователь'} • выплата ${payoutAmount}₽ зафиксирована`,
    });
  };

  const adjustBalance = async (profile: UserProfile, delta: number, reason: string) => {
    if (!isAdmin && !currentUserIsAdmin) {
      toast({ title: 'Нет прав', description: 'Нужна роль admin', variant: 'destructive' });
      return;
    }
    const trimmed = reason.trim();
    if (!trimmed) {
      toast({ title: 'Укажите пояснение', description: 'Пользователь должен видеть, за что начислено/списано', variant: 'destructive' });
      return;
    }
    setAdjustingId(profile.user_id);
    const { data, error } = await supabase.rpc('admin_adjust_balance', {
      _user_id: profile.user_id,
      _delta: delta,
      _reason: trimmed,
    });
    setAdjustingId(null);
    if (error) {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
      return;
    }
    const result = data as { ok: boolean; error?: string; new_balance?: number };
    if (!result?.ok) {
      const msg = result?.error === 'negative_balance' ? 'Баланс не может быть отрицательным' :
                  result?.error === 'forbidden' ? 'Нет прав' :
                  result?.error || 'Не удалось обновить баланс';
      toast({ title: 'Ошибка', description: msg, variant: 'destructive' });
      return;
    }
    const newBalance = Number(result.new_balance ?? 0);
    setProfiles(prev => prev.map(p => p.user_id === profile.user_id ? { ...p, balance: newBalance } : p));
    setAdjustAmounts(prev => ({ ...prev, [profile.user_id]: '' }));
    setAdjustDialog(null);
    setAdjustReason('');
    toast({
      title: delta > 0 ? `+${delta}₽ начислено` : `${delta}₽ списано`,
      description: `${profile.display_name || profile.email || 'Пользователь'} • ${trimmed} • баланс ${newBalance}₽`,
    });
  };

  const manualRestore = async () => {
    if (!isAdmin && !currentUserIsAdmin) {
      toast({ title: 'Нет прав', description: 'Нужна роль admin', variant: 'destructive' });
      return;
    }
    if (!mrUserId) {
      toast({ title: 'Выберите пользователя', variant: 'destructive' });
      return;
    }
    if (!mrTaskId) {
      toast({ title: 'Выберите задание', variant: 'destructive' });
      return;
    }
    const orders = mrOrders
      .split(/[\s,;\n\r\t]+/)
      .map(s => s.trim())
      .filter(Boolean);
    if (orders.length === 0) {
      toast({ title: 'Введите хотя бы один номер заказа', variant: 'destructive' });
      return;
    }
    const price = Math.max(0, Number(mrPrice) || 0);
    const profile = profiles.find(p => p.user_id === mrUserId);
    if (!profile) {
      toast({ title: 'Пользователь не найден', variant: 'destructive' });
      return;
    }
    const sumDelta = mrStatus === 'done' ? price * orders.length : 0;
    const confirmMsg =
      `Создать ${orders.length} запис${orders.length === 1 ? 'ь' : 'и/ей'} со статусом "${mrStatus}" для ${profile.email}.` +
      (mrStatus === 'done' ? ` Баланс будет увеличен на ${sumDelta}₽.` : ' Баланс не изменится (статус paid).');
    if (!confirm(confirmMsg)) return;

    setMrBusy(true);
    const nowIso = new Date().toISOString();
    const rows = orders.map(order_number => ({
      task_id: mrTaskId,
      user_id: mrUserId,
      order_number,
      status: mrStatus,
      accepted_at: nowIso,
      completed_at: nowIso,
    }));
    const { data: inserted, error } = await supabase
      .from('completed_tasks')
      .insert(rows)
      .select('id');
    if (error) {
      setMrBusy(false);
      toast({ title: 'Ошибка вставки', description: error.message, variant: 'destructive' });
      return;
    }
    if (mrStatus === 'done' && sumDelta > 0) {
      const newBalance = Number(profile.balance) + sumDelta;
      const { error: balErr } = await supabase
        .from('profiles')
        .update({ balance: newBalance })
        .eq('user_id', mrUserId);
      if (balErr) {
        setMrBusy(false);
        toast({
          title: 'Записи созданы, но баланс не обновлён',
          description: balErr.message,
          variant: 'destructive',
        });
        await loadData();
        return;
      }
    }
    setMrBusy(false);
    setMrOrders('');
    await loadData();
    toast({
      title: 'Восстановлено',
      description: `Создано: ${inserted?.length ?? orders.length}. ${mrStatus === 'done' ? `+${sumDelta}₽ на баланс.` : 'Статус paid (без изменения баланса).'}`,
    });
  };

  const submitVideoEditTask = async () => {
    if (!canManageTasks) {
      toast({ title: 'Нет прав', description: 'Нужна роль admin', variant: 'destructive' });
      return;
    }
    const name = veName.trim();
    const desc = veDesc.trim();
    const source = veSource.trim();
    const ref = veRef.trim();
    if (!name || !desc) {
      toast({ title: 'Заполните название и описание', variant: 'destructive' });
      return;
    }
    setVeSubmitting(true);
    const task_id = 'videoedit_' + Date.now();
    // Описание + ссылка на исходники складываем в одно поле description
    const fullDesc = source
      ? `${desc}\n\n📦 Исходники: ${source}`
      : desc;
    const { error } = await supabase.from('tasks').insert({
      task_id,
      name,
      addr2: 'Монтаж видео',
      task_type: 'video_edit',
      description: fullDesc,
      reference_link: ref || null,
      created_by: user?.id ?? null,
    });
    setVeSubmitting(false);
    if (error) {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
      return;
    }
    setVeName(''); setVeDesc(''); setVeSource(''); setVeRef('');
    await loadData();
    toast({ title: 'Задание создано', description: `«${name}» доступно исполнителям` });
  };


  const eligiblePayoutUsers = profiles
    .map(profile => {
      const stat = unpaidOfferStats[profile.user_id] || { withImage: 0, noImage: 0 };
      const totalTasks = stat.withImage + stat.noImage;
      const payoutTotal = stat.withImage * 30 + stat.noImage * 20;

      return {
        profile,
        withImage: stat.withImage,
        noImage: stat.noImage,
        totalTasks,
        payoutTotal,
      };
    })
    .filter(item => item.totalTasks >= 10 && !item.profile.payout_hold && !pendingPayoutByUser[item.profile.user_id])
    .sort((a, b) => b.payoutTotal - a.payoutTotal);

  const heldUsers = profiles
    .filter(p => p.payout_hold || pendingPayoutByUser[p.user_id])
    .map(p => {
      const stat = unpaidOfferStats[p.user_id] || { withImage: 0, noImage: 0 };
      const fromRequest = pendingPayoutByUser[p.user_id];
      const isRequest = !p.payout_hold && !!fromRequest;
      return {
        profile: p,
        withImage: p.payout_hold ? (p.payout_hold_with_image || 0) : stat.withImage,
        noImage: p.payout_hold ? (p.payout_hold_no_image || 0) : stat.noImage,
        payoutTotal: p.payout_hold
          ? (Number(p.payout_hold_amount) || 0)
          : (fromRequest ? fromRequest.amount : stat.withImage * 30 + stat.noImage * 20),
        isRequest,
      };
    })
    .sort((a, b) => b.payoutTotal - a.payoutTotal);

  const toggleHold = async (profile: UserProfile) => {
    if (!isAdmin && !currentUserIsAdmin) {
      toast({ title: 'Нет прав', variant: 'destructive' });
      return;
    }
    setAdjustingId(profile.user_id);
    if (profile.payout_hold) {
      // снять холд = деньги выплачены: помечаем done-задания как paid + чистим холд
      const { error: tasksError } = await supabase
        .from('completed_tasks')
        .update({ status: 'paid' })
        .eq('user_id', profile.user_id)
        .eq('status', 'done');
      if (tasksError) {
        setAdjustingId(null);
        toast({ title: 'Ошибка', description: tasksError.message, variant: 'destructive' });
        return;
      }
      const { error } = await supabase
        .from('profiles')
        .update({
          payout_hold: false,
          payout_hold_at: null,
          payout_hold_amount: 0,
          payout_hold_with_image: 0,
          payout_hold_no_image: 0,
        })
        .eq('user_id', profile.user_id);
      setAdjustingId(null);
      if (error) {
        toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
        return;
      }
      await loadData();
      toast({ title: '✅ Выплачено', description: 'Холд снят, задания закрыты как оплаченные' });
    } else {
      const stat = unpaidOfferStats[profile.user_id] || { withImage: 0, noImage: 0 };
      const total = stat.withImage * 30 + stat.noImage * 20;
      const { error } = await supabase
        .from('profiles')
        .update({
          payout_hold: true,
          payout_hold_at: new Date().toISOString(),
          payout_hold_amount: total,
          payout_hold_with_image: stat.withImage,
          payout_hold_no_image: stat.noImage,
        })
        .eq('user_id', profile.user_id);
      setAdjustingId(null);
      if (error) {
        toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
        return;
      }
      await loadData();
      toast({ title: 'Холд включён', description: `${total}₽ зафиксировано` });
    }
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

        {/* Задания за неделю */}
        {(() => {
          const weekTotal = weeklyStats.reduce((s, d) => s + d.total, 0);
          const weekRevenue = weeklyStats.reduce((s, d) => s + d.revenue, 0);
          const maxTotal = Math.max(1, ...weeklyStats.map(d => d.total));
          return (
            <section className="bg-card rounded-2xl border border-border shadow-sm p-4 space-y-3">
              <div>
                <h2 className="text-sm font-black text-foreground uppercase tracking-widest">Задания за неделю</h2>
                <p className="text-[10px] text-muted-foreground font-bold mt-1">
                  Сколько заданий выполнено за день и сколько денег по цене клиента (100₽ с фото / 70₽ без).
                </p>
              </div>
              <div className="overflow-x-auto -mx-1 px-1">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] uppercase">День</TableHead>
                      <TableHead className="text-center text-[10px] uppercase">Заданий</TableHead>
                      <TableHead className="text-right text-[10px] uppercase">Доход</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {weeklyStats.map(d => {
                      const isToday = d.date === weeklyStats[weeklyStats.length - 1]?.date;
                      const widthPct = (d.total / maxTotal) * 100;
                      return (
                        <TableRow key={d.date} className={isToday ? 'bg-primary/5' : ''}>
                          <TableCell className="font-black text-foreground py-2">
                            <div className="flex flex-col">
                              <span>{d.label}</span>
                              {isToday && <span className="text-[9px] text-primary font-black uppercase">Сегодня</span>}
                            </div>
                          </TableCell>
                          <TableCell className="text-center py-2">
                            <div className="flex flex-col items-center gap-1">
                              <span className="font-black text-foreground">{d.total}</span>
                              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-primary rounded-full" style={{ width: `${widthPct}%` }} />
                              </div>
                              <span className="text-[9px] text-muted-foreground font-bold">📷{d.withImage} · 📝{d.noImage}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-black text-primary py-2">{d.revenue}₽</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="bg-muted/50 rounded-2xl p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black text-muted-foreground uppercase">Итого за 7 дней</p>
                  <p className="text-[10px] font-bold text-muted-foreground mt-0.5">{weekTotal} заданий</p>
                </div>
                <p className="text-lg font-black text-primary">{weekRevenue}₽</p>
              </div>
            </section>
          );
        })()}

        {/* Суммы по неоплаченным заданиям */}
        {(() => {
          const COMPANY_IMAGE_PRICE = 100;
          const COMPANY_TEXT_PRICE = 70;
          const USER_IMAGE_PRICE = 30;
          const USER_TEXT_PRICE = 20;

          const totals = eligiblePayoutUsers.reduce(
            (acc, stat) => ({
              withImage: acc.withImage + stat.withImage,
              noImage: acc.noImage + stat.noImage,
            }),
            { withImage: 0, noImage: 0 }
          );

          const companyTotal = totals.withImage * COMPANY_IMAGE_PRICE + totals.noImage * COMPANY_TEXT_PRICE;
          const userTotal = totals.withImage * USER_IMAGE_PRICE + totals.noImage * USER_TEXT_PRICE;
          const taskTotal = totals.withImage + totals.noImage;

          return (
            <section className="bg-card rounded-2xl border border-border shadow-sm p-4 space-y-3">
              <div>
                <h2 className="text-sm font-black text-foreground uppercase tracking-widest">Неоплаченные задания</h2>
                <p className="text-[10px] text-muted-foreground font-bold mt-1">
                  Сразу видно две суммы: компании и на выплату юзерам.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-primary/10 rounded-2xl p-3">
                  <p className="text-[9px] font-black text-muted-foreground uppercase">Компания получает</p>
                  <p className="text-xl font-black text-primary mt-1">{companyTotal}₽</p>
                  <p className="text-[10px] font-bold text-muted-foreground mt-1">
                    {totals.withImage} × 100₽ + {totals.noImage} × 70₽
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPayoutDialogOpen(true)}
                  className="bg-accent/10 rounded-2xl p-3 text-left transition-colors hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <p className="text-[9px] font-black text-muted-foreground uppercase">Юзерам выплатить</p>
                  <p className="text-xl font-black text-accent mt-1">{userTotal}₽</p>
                  <p className="text-[10px] font-bold text-muted-foreground mt-1">
                    {totals.withImage} × 30₽ + {totals.noImage} × 20₽
                  </p>
                </button>
              </div>

              <div className="bg-muted/50 rounded-2xl p-3 flex items-center justify-between gap-3">
                <p className="text-[10px] font-black text-muted-foreground uppercase">Всего неоплаченных заданий</p>
                <p className="text-lg font-black text-foreground">{taskTotal}</p>
              </div>
            </section>
          );
        })()}

        {heldUsers.length > 0 && (
          <section className="bg-warning/10 rounded-2xl border-2 border-warning/40 shadow-sm p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Pause size={18} className="text-warning" />
              <h2 className="text-sm font-black text-foreground uppercase tracking-widest">
                На холде ({heldUsers.length})
              </h2>
            </div>
            <p className="text-[10px] text-muted-foreground font-bold">
              Эти юзеры ждут выплату. Сумма зафиксирована, новые задания после холда сюда не попадают.
            </p>
            <div className="space-y-2">
              {heldUsers.map(({ profile, withImage, noImage, payoutTotal, isRequest }) => (
                <div key={profile.user_id} className="bg-card rounded-xl p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-foreground text-sm truncate">{profile.display_name || profile.email || '—'}</p>
                    <p className="text-[10px] text-muted-foreground font-bold">
                      📷{withImage} · 📝{noImage} · {isRequest ? 'заявка на выплату' : `с ${profile.payout_hold_at ? new Date(profile.payout_hold_at).toLocaleDateString('ru-RU') : '—'}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-black text-warning">{payoutTotal}₽</p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {!isRequest && (
                      <Button
                        size="sm"
                        className="h-8 rounded-xl px-2 text-[10px] font-black gap-1 bg-accent text-accent-foreground hover:bg-accent/90"
                        onClick={() => toggleHold(profile)}
                        disabled={adjustingId === profile.user_id}
                      >
                        <CheckCircle size={11} /> Выплачено
                      </Button>
                    )}
                    {isRequest && (
                      <span className="text-[9px] font-black uppercase text-warning bg-warning/15 rounded-full px-2 py-1 text-center">
                        ждёт выплаты
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <AdminPayoutRequests />

        <Dialog open={isPayoutDialogOpen} onOpenChange={setIsPayoutDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden rounded-2xl">
            <DialogHeader>
              <DialogTitle>Юзерам выплатить</DialogTitle>
              <DialogDescription>
                Показаны только пользователи, у которых 10 и более неоплаченных заданий.
              </DialogDescription>
            </DialogHeader>

            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ник</TableHead>
                    <TableHead className="text-center">Скарт</TableHead>
                    <TableHead className="text-center">Безкарт</TableHead>
                    <TableHead className="text-right">Сумма к выплате</TableHead>
                    <TableHead className="text-right">Действие</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eligiblePayoutUsers.map(({ profile, withImage, noImage, payoutTotal }) => (
                    <TableRow key={profile.user_id}>
                      <TableCell>
                        <div className="min-w-0">
                          <p className="font-black text-foreground truncate">{profile.display_name || 'Без имени'}</p>
                          <p className="text-xs text-muted-foreground truncate">{profile.email || '—'}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-black">{withImage}</TableCell>
                      <TableCell className="text-center font-black">{noImage}</TableCell>
                      <TableCell className="text-right font-black text-accent">{payoutTotal}₽</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          className="rounded-xl font-black uppercase text-xs bg-accent text-accent-foreground hover:bg-accent/90"
                          disabled={adjustingId === profile.user_id}
                          onClick={() => resetBalance(profile)}
                        >
                          Выплачено
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {eligiblePayoutUsers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        Нет пользователей с 10+ неоплаченными заданиями.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </DialogContent>
        </Dialog>

        {/* Журнал удалений / восстановление */}
        <section className="bg-card rounded-2xl border border-border shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Archive size={18} className="text-warning" />
            <h2 className="text-sm font-black text-foreground uppercase tracking-widest">
              Журнал удалений
            </h2>
          </div>
          <p className="text-[10px] text-muted-foreground font-bold">
            Все строки, удалённые из архива выполненных заданий. Можно восстановить за выбранную дату.
          </p>
          <div className="flex gap-2 items-center">
            <Input
              type="date"
              value={logDate}
              onChange={e => setLogDate(e.target.value)}
              className="h-9 text-sm flex-1"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-9 rounded-xl px-3"
              onClick={loadDeletedLog}
              disabled={logLoading}
            >
              <RefreshCw size={14} />
            </Button>
          </div>

          <div className="space-y-2">
            {logLoading && (
              <p className="text-center text-muted-foreground text-xs py-4">Загрузка...</p>
            )}
            {!logLoading && deletedLog.length === 0 && (
              <p className="text-center text-muted-foreground text-xs py-4">
                За {new Date(logDate).toLocaleDateString('ru-RU')} удалений не было
              </p>
            )}
            {deletedLog.map(row => {
              const owner = profiles.find(p => p.user_id === row.user_id);
              return (
                <div key={row.id} className="bg-muted/50 rounded-xl p-3">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black text-foreground truncate">
                        {owner?.display_name || owner?.email || row.user_id.slice(0, 8)}
                      </p>
                      <p className="text-[10px] text-muted-foreground font-bold">
                        Заказ №{row.order_number} • статус: {row.status}
                      </p>
                      <p className="text-[9px] text-muted-foreground">
                        Удалено: {new Date(row.deleted_at).toLocaleString('ru-RU')}
                      </p>
                    </div>
                    {row.restored ? (
                      <span className="text-[9px] font-black px-2 py-1 rounded-full bg-accent/10 text-accent uppercase shrink-0">
                        Восст.
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        className="h-8 rounded-xl gap-1 font-black uppercase text-[10px] bg-accent text-accent-foreground hover:bg-accent/90 shrink-0"
                        onClick={() => restoreDeleted(row)}
                        disabled={restoringId === row.id}
                      >
                        <Undo2 size={12} /> Вернуть
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Ручное восстановление completed_tasks */}
        <section className="bg-card rounded-2xl border border-border shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Wrench size={18} className="text-primary" />
            <h2 className="text-sm font-black text-foreground uppercase tracking-widest">
              Ручное восстановление
            </h2>
          </div>
          <p className="text-[10px] text-muted-foreground font-bold">
            Создаёт записи completed_tasks по списку номеров заказов. Если статус «done» — баланс пересчитается автоматически (price × количество). Если «paid» — без изменения баланса.
          </p>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-muted-foreground">Пользователь</label>
            <select
              value={mrUserId}
              onChange={e => setMrUserId(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— выберите пользователя —</option>
              {profiles.map(p => (
                <option key={p.user_id} value={p.user_id}>
                  {p.email || p.display_name || p.user_id.slice(0, 8)} • {p.balance}₽
                </option>
              ))}
            </select>

            <label className="text-[10px] font-black uppercase text-muted-foreground">Задание (привязка)</label>
            <select
              value={mrTaskId}
              onChange={e => setMrTaskId(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— выберите задание —</option>
              {tasks.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.addr1 || '—'})
                </option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-black uppercase text-muted-foreground">Статус</label>
                <select
                  value={mrStatus}
                  onChange={e => setMrStatus(e.target.value as 'done' | 'paid')}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="done">done (к выплате, +баланс)</option>
                  <option value="paid">paid (уже выплачено)</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-muted-foreground">Цена за 1, ₽</label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={mrPrice}
                  onChange={e => setMrPrice(e.target.value)}
                  className="h-10 text-sm"
                />
              </div>
            </div>

            <label className="text-[10px] font-black uppercase text-muted-foreground">
              Номера заказов (через запятую, пробел или новую строку)
            </label>
            <textarea
              value={mrOrders}
              onChange={e => setMrOrders(e.target.value)}
              rows={4}
              placeholder="260421-001, 260421-002, 260421-003"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            {(() => {
              const count = mrOrders.split(/[\s,;\n\r\t]+/).filter(Boolean).length;
              const sum = mrStatus === 'done' ? count * (Number(mrPrice) || 0) : 0;
              return (
                <p className="text-[11px] font-bold text-muted-foreground">
                  Будет создано: <span className="text-foreground">{count}</span>
                  {mrStatus === 'done' && (
                    <> • Баланс +<span className="text-accent">{sum}₽</span></>
                  )}
                </p>
              );
            })()}

            <Button
              onClick={manualRestore}
              disabled={mrBusy}
              className="w-full font-black uppercase rounded-2xl h-11 gap-2"
            >
              <Undo2 size={16} /> {mrBusy ? 'Создаём...' : 'Создать записи'}
            </Button>
          </div>
        </section>

        {/* Создать задание на монтаж видео */}
        <section className="bg-card rounded-2xl border border-border shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Film size={18} className="text-warning" />
            <h2 className="text-sm font-black text-foreground uppercase tracking-widest">
              Новое задание · Монтаж видео
            </h2>
          </div>
          <p className="text-[10px] text-muted-foreground font-bold">
            Появится у всех исполнителей в общем списке. За принятый монтаж — 200₽ на баланс после подтверждения админом.
          </p>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-muted-foreground">Название</label>
            <Input
              value={veName}
              onChange={e => setVeName(e.target.value)}
              placeholder="Напр.: Reels для кофейни «Брусника»"
              className="h-10 text-sm"
              disabled={veSubmitting}
            />

            <label className="text-[10px] font-black uppercase text-muted-foreground">Что нужно сделать (описание)</label>
            <Textarea
              value={veDesc}
              onChange={e => setVeDesc(e.target.value)}
              placeholder="Подробно опиши: длина, стиль, музыка, какие склейки, текст на экране и т.д."
              rows={5}
              disabled={veSubmitting}
            />

            <label className="text-[10px] font-black uppercase text-muted-foreground">Ссылка на исходники</label>
            <Input
              value={veSource}
              onChange={e => setVeSource(e.target.value)}
              placeholder="https://disk.yandex.ru/... или Google Drive"
              className="h-10 text-sm"
              disabled={veSubmitting}
            />

            <label className="text-[10px] font-black uppercase text-muted-foreground">Ссылка-референс (необязательно)</label>
            <Input
              value={veRef}
              onChange={e => setVeRef(e.target.value)}
              placeholder="Пример видео того же стиля"
              className="h-10 text-sm"
              disabled={veSubmitting}
            />

            <Button
              onClick={submitVideoEditTask}
              disabled={veSubmitting || !canManageTasks || !veName.trim() || !veDesc.trim()}
              className="w-full font-black uppercase rounded-2xl h-11 gap-2 bg-warning text-warning-foreground hover:bg-warning/90"
            >
              <Plus size={16} /> {veSubmitting ? 'Создаём...' : 'Создать задание'}
            </Button>
            {!canManageTasks && (
              <p className="text-[10px] text-destructive font-semibold">Нужна роль admin для аккаунта vt@admin.com.</p>
            )}
          </div>
        </section>

        {/* User list */}

        <h2 className="text-sm font-black text-foreground uppercase tracking-widest pt-2">Все пользователи</h2>
        {[...profiles].sort((a, b) => Number(b.balance) - Number(a.balance)).map(p => {
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
                  {taskEarningTotals[p.user_id] > 0 && (
                    <p className="text-[9px] font-black text-accent uppercase mt-0.5">
                      Задания: +{taskEarningTotals[p.user_id]}₽
                    </p>
                  )}
                  {bonusTotals[p.user_id] > 0 && (
                    <p className="text-[9px] font-black text-primary uppercase mt-0.5">
                      Бонус: +{bonusTotals[p.user_id]}₽
                    </p>
                  )}
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
                  onClick={() => { setAdjustReason(''); setAdjustDialog({ profile: p, delta: Math.abs(Number(adjustAmounts[p.user_id]) || 0) }); }}
                >
                  <Plus size={16} />
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-9 rounded-xl px-3"
                  disabled={adjustingId === p.user_id || !Number(adjustAmounts[p.user_id])}
                  onClick={() => { setAdjustReason(''); setAdjustDialog({ profile: p, delta: -Math.abs(Number(adjustAmounts[p.user_id]) || 0) }); }}
                >
                  <Minus size={16} />
                </Button>
              </div>

              {(() => {
                const stat = unpaidOfferStats[p.user_id] || { withImage: 0, noImage: 0 };
                const totalUnpaid = stat.withImage + stat.noImage;
                const hasPendingRequest = !!pendingPayoutByUser[p.user_id];
                const showHold = ((totalUnpaid >= 10) || p.payout_hold) && !hasPendingRequest;
                return (
                  <>
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
                        disabled={adjustingId === p.user_id || (Number(p.balance) === 0 && (doneCounts[p.user_id] || 0) === 0)}
                        onClick={() => resetBalance(p)}
                      >
                        <RotateCcw size={14} /> Выплата
                      </Button>
                    </div>
                    {showHold && (
                      <Button
                        size="sm"
                        variant="default"
                        className={`w-full h-9 rounded-xl gap-2 font-black uppercase text-xs ${p.payout_hold ? 'bg-accent text-accent-foreground hover:bg-accent/90' : 'bg-warning text-warning-foreground hover:bg-warning/90'}`}
                        disabled={adjustingId === p.user_id}
                        onClick={() => toggleHold(p)}
                      >
                        {p.payout_hold ? (
                          <><CheckCircle size={14} /> Выплачено ({Number(p.payout_hold_amount) || 0}₽)</>
                        ) : (
                          <><Pause size={14} /> Холд ({stat.withImage * 30 + stat.noImage * 20}₽)</>
                        )}
                      </Button>
                    )}
                  </>
                );
              })()}
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

              {!historyLoading && balanceHistoryItems.length > 0 && (
                <>
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest pt-4 pb-1">
                    Корректировки баланса
                  </p>
                  {balanceHistoryItems.map(bh => {
                    const positive = Number(bh.delta) > 0;
                    return (
                      <div key={bh.id} className={`rounded-xl p-3 border ${positive ? 'bg-accent/5 border-accent/30' : 'bg-destructive/5 border-destructive/30'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-black text-foreground">
                              {bh.reason || 'Без пояснения'}
                            </p>
                            <p className="text-[10px] text-muted-foreground font-bold">
                              {new Date(bh.created_at).toLocaleString('ru-RU')} • Баланс стал {Number(bh.new_balance)}₽
                            </p>
                          </div>
                          <span className={`text-sm font-black shrink-0 ${positive ? 'text-accent' : 'text-destructive'}`}>
                            {positive ? '+' : ''}{Number(bh.delta)}₽
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Adjust balance reason dialog */}
      <Dialog open={!!adjustDialog} onOpenChange={(open) => { if (!open) { setAdjustDialog(null); setAdjustReason(''); } }}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle>
              {adjustDialog && adjustDialog.delta > 0 ? `Зачислить ${adjustDialog.delta}₽` : `Списать ${Math.abs(adjustDialog?.delta || 0)}₽`}
            </DialogTitle>
            <DialogDescription>
              {adjustDialog?.profile.display_name || adjustDialog?.profile.email || 'Пользователь'} • текущий баланс {adjustDialog?.profile.balance}₽
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
              Пояснение (увидит юзер в истории)
            </label>
            <Textarea
              autoFocus
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              placeholder="Например: бонус за активность, штраф за нарушение, доплата за заказ №123"
              rows={3}
              className="rounded-xl"
            />
            <div className="flex gap-2 justify-end pt-2">
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => { setAdjustDialog(null); setAdjustReason(''); }}
              >
                Отмена
              </Button>
              <Button
                className="rounded-xl bg-accent text-accent-foreground hover:bg-accent/90 font-black"
                disabled={!adjustReason.trim() || (adjustDialog ? adjustingId === adjustDialog.profile.user_id : false)}
                onClick={() => adjustDialog && adjustBalance(adjustDialog.profile, adjustDialog.delta, adjustReason)}
              >
                Подтвердить
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
