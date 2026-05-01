import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { LogOut, Plus, CheckCircle, Clock, Package, Archive, RotateCcw, Users, History, X, AlertTriangle, FileText, Image as ImageIcon, Upload, XCircle, Ban, Tag, Filter, Check, Volume2, VolumeX, Video } from 'lucide-react';

interface CompletedTask {
  id: string;
  order_number: string;
  status: string;
  created_at: string;
  user_id: string;
  task_id: string;
  reject_reason?: string | null;
  tasks: { task_id: string; name: string; task_type?: string; image_url?: string | null } | null;
}

interface CompletedTaskWithProfile extends CompletedTask {
  executor_name?: string;
}

interface TaskInfo {
  id: string;
  task_id: string;
  name: string;
  status: string;
  expires_at: string | null;
  created_at: string;
  restaurant_tag?: string | null;
}

interface OrderIssueReport {
  id: string;
  created_at: string;
  problem_type: string;
  status: string;
  task_id: string;
  user_id: string;
  tasks: { id: string; name: string | null; link: string | null } | null;
  executor_name?: string;
}

function parseTaskText(text: string): { name: string; addr1: string; addr2: string; link: string; task_id: string } | null {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  let addr1 = '';
  let addr2 = '';
  let link = '';
  let name = '';

  const skipPatterns = [
    /^российская\s+федерация$/i,
    /^россия$/i,
    /^москва$/i,
    /^\[/,
    /^яндекс$/i,
  ];

  for (const line of lines) {
    if (line.startsWith('http') && line.includes('eda.yandex')) {
      if (!link) link = line;
      continue;
    }
    if (skipPatterns.some(p => p.test(line))) continue;

    // Remove leading "Российская Федерация, Москва, " or "Москва, " from address lines
    const cleaned = line
      .replace(/^Российская\s+Федерация,?\s*/i, '')
      .replace(/^Россия,?\s*/i, '')
      .replace(/^Москва,?\s*/i, '')
      .trim();

    if (!cleaned) continue;

    if (!addr1) {
      addr1 = cleaned;
    } else if (!addr2) {
      addr2 = cleaned;
    }
  }

  if (!link || !addr1 || !addr2) return null;

  const slugMatch = link.match(/placeSlug=([^&]+)/);
  if (slugMatch) {
    name = slugMatch[1].replace(/_/g, ' ').replace(/\s+[a-z0-9]+$/, '').toUpperCase();
  } else {
    const rMatch = link.match(/\/r\/([^?]+)/);
    name = rMatch ? rMatch[1].replace(/_/g, ' ').toUpperCase() : 'Ресторан';
  }

  // Add street to name for branch identification
  const streetMatch = addr1.match(/(?:улица|ул\.|переулок|проспект|бульвар|шоссе)\s+[^,]+/i)
    || addr1.match(/([^,]+)/);
  if (streetMatch) {
    name = name + ' · ' + streetMatch[0].trim();
  }

  const task_id = (slugMatch?.[1] || 'task') + '_' + Date.now();

  return { name, addr1, addr2, link, task_id };
}

export default function AdminDashboard() {
  const { signOut } = useAuth();
  const { toast } = useToast();
  const [completedTasks, setCompletedTasks] = useState<CompletedTaskWithProfile[]>([]);
  const [allTasks, setAllTasks] = useState<TaskInfo[]>([]);
  const [showAddTask, setShowAddTask] = useState(false);
  const [taskText, setTaskText] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'done' | 'archive' | 'mytasks' | 'users' | 'issues'>('mytasks');
  const [taskExecutorCounts, setTaskExecutorCounts] = useState<Record<string, number>>({});
  const [historyUser, setHistoryUser] = useState<{ user_id: string; name: string } | null>(null);
  const [historyItems, setHistoryItems] = useState<Array<{ id: string; order_number: string; completed_at: string | null; task_name: string; status: string; task_type?: string; image_url?: string | null }>>([]);
  const [issueReports, setIssueReports] = useState<OrderIssueReport[]>([]);
  const prevIssueCountRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Reject flow
  const [rejectTarget, setRejectTarget] = useState<CompletedTaskWithProfile | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const REJECT_PRESETS = [
    'Неверный номер заказа',
    'Заказ не найден в системе',
    'Дубликат заявки',
    'Заказ оформлен не там',
    'Отзыв не прошел',
  ];

  // Add task flow
  const [showTypeSelect, setShowTypeSelect] = useState(false);
  const [taskKind, setTaskKind] = useState<'text' | 'image' | 'reels' | null>(null);

  // Image task state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageAddr, setImageAddr] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reels task state
  const [reelsName, setReelsName] = useState('');
  const [reelsDesc, setReelsDesc] = useState('');
  const [reelsRef, setReelsRef] = useState('');
  const [submittingReels, setSubmittingReels] = useState(false);

  // Timer selection state
  const [parsedTask, setParsedTask] = useState<ReturnType<typeof parseTaskText>>(null);
  const [showTimerSelect, setShowTimerSelect] = useState(false);
  const [selectedTimer, setSelectedTimer] = useState<'30' | '60' | 'none'>('none');

  // Archive tagging
  const [archiveFilter, setArchiveFilter] = useState<string>('all');
  const [tagTarget, setTagTarget] = useState<TaskInfo | null>(null);
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    const refreshAdminData = () => {
      loadCompletedTasks();
      loadAllTasks();
      loadExecutorCounts();
      loadIssueReports();
    };

    refreshAdminData();

    const expireInterval = setInterval(checkExpiredTasks, 30000);
    const refreshInterval = setInterval(refreshAdminData, 10000);
    const handleWindowFocus = () => refreshAdminData();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshAdminData();
    };

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const completedTasksChannel = supabase
      .channel('admin-completed-tasks-feed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'completed_tasks' },
        () => {
          loadCompletedTasks();
          loadExecutorCounts();
        }
      )
      .subscribe();

    const tasksChannel = supabase
      .channel('admin-tasks-feed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        () => loadAllTasks()
      )
      .subscribe();

    const issueReportsChannel = supabase
      .channel('admin-issue-reports-feed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_issue_reports' },
        () => loadIssueReports()
      )
      .subscribe();

    return () => {
      clearInterval(expireInterval);
      clearInterval(refreshInterval);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      supabase.removeChannel(completedTasksChannel);
      supabase.removeChannel(tasksChannel);
      supabase.removeChannel(issueReportsChannel);
    };
  }, []);

  // Sound + title badge for new pending issues (questions)
  useEffect(() => {
    const pendingCount = issueReports.filter(i => i.status === 'pending').length;

    // Update browser tab title
    const baseTitle = 'Админ-панель';
    document.title = pendingCount > 0 ? `(${pendingCount}) ${baseTitle} · Вопросы` : baseTitle;

    // Play sound only if count increased (new issue arrived) and not on first load
    const prev = prevIssueCountRef.current;
    if (prev > 0 && pendingCount > prev) {
      try {
        if (!audioCtxRef.current) {
          const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
          audioCtxRef.current = new Ctx();
        }
        const ctx = audioCtxRef.current!;
        if (ctx.state === 'suspended') ctx.resume();
        const now = ctx.currentTime;
        // Two-tone "ding"
        [880, 1320].forEach((freq, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sine';
          o.frequency.value = freq;
          g.gain.setValueAtTime(0, now + i * 0.18);
          g.gain.linearRampToValueAtTime(0.25, now + i * 0.18 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.35);
          o.connect(g).connect(ctx.destination);
          o.start(now + i * 0.18);
          o.stop(now + i * 0.18 + 0.36);
        });
      } catch (err) {
        // audio blocked, ignore
      }
    }
    prevIssueCountRef.current = pendingCount;
  }, [issueReports]);

  const loadAllTasks = async () => {
    const { data } = await supabase
      .from('tasks')
      .select('id, task_id, name, status, expires_at, created_at, restaurant_tag')
      .order('created_at', { ascending: false });
    setAllTasks(data ?? []);
  };

  const loadExecutorCounts = async () => {
    const { data } = await supabase.from('completed_tasks').select('task_id');
    if (!data) return;
    const counts: Record<string, number> = {};
    data.forEach(d => { counts[d.task_id] = (counts[d.task_id] || 0) + 1; });
    setTaskExecutorCounts(counts);
  };

  const checkExpiredTasks = async () => {
    const now = new Date().toISOString();
    await supabase
      .from('tasks')
      .update({ status: 'archived' })
      .eq('status', 'available')
      .lt('expires_at', now)
      .not('expires_at', 'is', null);
    loadAllTasks();
  };

  const loadCompletedTasks = async () => {
    const { data } = await supabase
      .from('completed_tasks')
      .select('*, tasks(task_id, name, task_type, image_url)')
      .order('created_at', { ascending: false });

    if (!data) { setCompletedTasks([]); return; }

    const userIds = [...new Set(data.map(d => d.user_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, display_name')
      .in('user_id', userIds);

    const profileMap = new Map(profiles?.map(p => [p.user_id, p.display_name]) ?? []);

    setCompletedTasks(data.map(ct => ({
      ...ct,
      tasks: ct.tasks as any,
      executor_name: profileMap.get(ct.user_id) ?? undefined,
    })));
  };

  const loadIssueReports = async () => {
    const { data } = await (supabase as any)
      .from('order_issue_reports')
      .select('id, created_at, problem_type, status, task_id, user_id, tasks(id, name, link)')
      .order('created_at', { ascending: false });

    if (!data) {
      setIssueReports([]);
      return;
    }

    const userIds = [...new Set((data as any[]).map((item) => item.user_id))] as string[];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, display_name')
      .in('user_id', userIds);

    const profileMap = new Map(profiles?.map(p => [p.user_id, p.display_name]) ?? []);
    setIssueReports((data as any[]).map((item) => ({
      ...item,
      tasks: item.tasks as any,
      executor_name: profileMap.get(item.user_id) ?? undefined,
    })));
  };

  const acceptTask = async (id: string) => {
    await supabase.from('completed_tasks').update({ status: 'accepted', accepted_at: new Date().toISOString() }).eq('id', id);
    loadCompletedTasks();
    toast({ title: 'Заказ принят' });
  };

  const completeTask = async (ct: CompletedTaskWithProfile) => {
    // Идемпотентно: атомарно меняет статус и начисляет баланс ровно один раз
    if (ct.status === 'done' || ct.status === 'paid') {
      toast({ title: 'Уже подтверждено', description: 'Баланс уже начислен ранее' });
      return;
    }
    const { data, error } = await supabase.rpc('admin_complete_task' as any, { _completed_id: ct.id });
    if (error) {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
      return;
    }
    const res = data as { ok: boolean; credited?: number; skipped?: string; error?: string };
    if (!res?.ok) {
      toast({ title: 'Ошибка', description: res?.error ?? 'Не удалось подтвердить', variant: 'destructive' });
      return;
    }
    loadCompletedTasks();
    if (res.skipped) {
      toast({ title: 'Уже было подтверждено', description: 'Повторное начисление пропущено' });
    } else {
      toast({ title: 'Готово!', description: `+${res.credited}₽ на баланс` });
    }
  };

  const awardReelsBonus = async (ct: CompletedTaskWithProfile) => {
    if (!confirm(`Начислить бонус +200₽ за 5000+ просмотров рилса исполнителю ${ct.executor_name || ''}?`)) return;
    const { data, error } = await supabase.rpc('admin_award_reels_bonus' as any, { _completed_id: ct.id });
    if (error) {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
      return;
    }
    const res = data as { ok: boolean; credited?: number; skipped?: string; error?: string };
    if (!res?.ok) {
      toast({ title: 'Ошибка', description: res?.error ?? 'Не удалось начислить', variant: 'destructive' });
      return;
    }
    if (res.skipped) {
      toast({ title: 'Бонус уже начислен', description: 'Повторное начисление пропущено' });
    } else {
      toast({ title: '🔥 Бонус начислен', description: `+${res.credited}₽ за просмотры` });
    }
    loadCompletedTasks();
  };

  const openReject = (ct: CompletedTaskWithProfile) => {
    setRejectTarget(ct);
    setRejectReason('');
  };

  const submitReject = async () => {
    if (!rejectTarget || !rejectReason.trim()) return;
    const { error } = await supabase
      .from('completed_tasks')
      .update({ status: 'rejected', reject_reason: rejectReason.trim() })
      .eq('id', rejectTarget.id);
    if (error) {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
      return;
    }
    setRejectTarget(null);
    setRejectReason('');
    loadCompletedTasks();
    toast({ title: 'Заявка отклонена' });
  };

  const openTypeSelect = () => {
    setShowTypeSelect(true);
  };

  const chooseTaskKind = (kind: 'text' | 'image' | 'reels') => {
    setTaskKind(kind);
    setShowTypeSelect(false);
    setShowAddTask(true);
  };

  const submitReelsTask = async () => {
    if (!reelsName.trim() || !reelsDesc.trim()) {
      toast({ title: 'Ошибка', description: 'Укажите название и описание задания.', variant: 'destructive' });
      return;
    }
    setSubmittingReels(true);
    const task_id = 'reels_' + Date.now();
    const { error } = await supabase.from('tasks').insert({
      task_id,
      name: reelsName.trim(),
      addr1: '',
      addr2: '—',
      link: '',
      task_type: 'reels',
      description: reelsDesc.trim(),
      reference_link: reelsRef.trim() || null,
    } as any);
    setSubmittingReels(false);
    if (error) {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
      return;
    }
    setReelsName('');
    setReelsDesc('');
    setReelsRef('');
    setTaskKind(null);
    setShowAddTask(false);
    loadAllTasks();
    toast({ title: 'Задание на рилс добавлено' });
  };

  const handleImagePick = (file: File | null) => {
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const submitImageTask = async () => {
    if (!imageFile || !imageAddr.trim()) {
      toast({ title: 'Ошибка', description: 'Загрузите картинку и укажите адрес доставки.', variant: 'destructive' });
      return;
    }
    setUploadingImage(true);
    try {
      const ext = imageFile.name.split('.').pop() || 'jpg';
      const path = `tasks/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from('task-images').upload(path, imageFile, {
        contentType: imageFile.type,
        upsert: false,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('task-images').getPublicUrl(path);

      const task_id = 'img_' + Date.now();
      const { error } = await supabase.from('tasks').insert({
        task_id,
        name: 'Задание с картинкой',
        addr1: '',
        addr2: imageAddr.trim(),
        link: '',
        image_url: pub.publicUrl,
        task_type: 'image',
      });
      if (error) throw error;

      setImageFile(null);
      setImagePreview(null);
      setImageAddr('');
      setTaskKind(null);
      setShowAddTask(false);
      loadAllTasks();
      toast({ title: 'Задание с картинкой добавлено' });
    } catch (e: any) {
      toast({ title: 'Ошибка', description: e.message, variant: 'destructive' });
    } finally {
      setUploadingImage(false);
    }
  };

  const handleParseTask = () => {
    const parsed = parseTaskText(taskText);
    if (!parsed) {
      toast({ title: 'Ошибка', description: 'Не удалось распознать задание. Вставьте текст с адресами и ссылкой.', variant: 'destructive' });
      return;
    }
    setParsedTask(parsed);
    setSelectedTimer('none');
    setShowAddTask(false);
    setShowTimerSelect(true);
  };

  const confirmAddTask = async () => {
    if (!parsedTask) return;

    let expires_at: string | null = null;
    if (selectedTimer === '30') {
      expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    } else if (selectedTimer === '60') {
      expires_at = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    }

    const { error } = await supabase.from('tasks').insert({
      task_id: parsedTask.task_id,
      name: parsedTask.name,
      addr1: parsedTask.addr1,
      addr2: parsedTask.addr2,
      link: parsedTask.link,
      expires_at,
    });
    if (error) {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
      return;
    }
    setTaskText('');
    setParsedTask(null);
    setShowTimerSelect(false);
    loadAllTasks();
    toast({ title: 'Задание добавлено' });
  };

  const unarchiveTask = async (taskId: string) => {
    await supabase.from('tasks').update({ status: 'available', expires_at: null }).eq('id', taskId);
    loadAllTasks();
    toast({ title: 'Задание восстановлено' });
  };

  const archiveTask = async (taskId: string) => {
    await supabase.from('tasks').update({ status: 'archived' }).eq('id', taskId);
    loadAllTasks();
    toast({ title: 'Задание заархивировано' });
  };

  const deleteTask = async (taskId: string) => {
    // Проверяем, есть ли по этому заданию выполнения пользователей
    const { count, error: countError } = await supabase
      .from('completed_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('task_id', taskId);

    if (countError) {
      toast({ title: 'Ошибка проверки', description: countError.message, variant: 'destructive' });
      return;
    }

    if ((count ?? 0) > 0) {
      toast({
        title: 'Нельзя удалить',
        description: `По этому заданию есть ${count} выполнений пользователей. История сохранена — задание просто остаётся в архиве.`,
        variant: 'destructive',
      });
      return;
    }

    const { error: taskError } = await supabase
      .from('tasks')
      .delete()
      .eq('id', taskId);

    if (taskError) {
      toast({ title: 'Ошибка удаления', description: taskError.message, variant: 'destructive' });
      return;
    }

    loadCompletedTasks();
    loadAllTasks();
    loadExecutorCounts();
    toast({ title: 'Задание удалено' });
  };

  const resolveIssue = async (issueId: string) => {
    const { error } = await (supabase as any)
      .from('order_issue_reports')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', issueId);

    if (error) {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
      return;
    }

    loadIssueReports();
    toast({ title: 'Проблема отмечена как исправленная' });
  };

  const deleteTaskFromIssue = async (issue: OrderIssueReport) => {
    if (!issue.tasks?.id) return;

    const { error: issueError } = await (supabase as any)
      .from('order_issue_reports')
      .delete()
      .eq('id', issue.id);

    if (issueError) {
      toast({ title: 'Ошибка', description: issueError.message, variant: 'destructive' });
      return;
    }

    const { error: taskError } = await supabase.from('tasks').delete().eq('id', issue.tasks.id);
    if (taskError) {
      toast({ title: 'Ошибка удаления', description: taskError.message, variant: 'destructive' });
      return;
    }

    loadIssueReports();
    loadAllTasks();
    toast({ title: 'Задание удалено' });
  };

  const saveTag = async () => {
    if (!tagTarget) return;
    const value = tagInput.trim() || null;
    const { error } = await supabase.from('tasks').update({ restaurant_tag: value }).eq('id', tagTarget.id);
    if (error) {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
      return;
    }
    setTagTarget(null);
    setTagInput('');
    loadAllTasks();
    toast({ title: value ? `Метка «${value}» сохранена` : 'Метка удалена' });
  };

  const archivedTags = (() => {
    const tags = new Set<string>();
    allTasks.filter(t => t.status === 'archived' && t.restaurant_tag).forEach(t => tags.add(t.restaurant_tag!));
    return Array.from(tags).sort();
  })();

  const archivedTasks = allTasks
    .filter(t => t.status === 'archived')
    .filter(t => archiveFilter === 'all' ? true : archiveFilter === '__none__' ? !t.restaurant_tag : t.restaurant_tag === archiveFilter);
  const activeTasks = allTasks.filter(t => t.status === 'available');
  const pendingIssues = issueReports.filter(issue => issue.status === 'pending');

  // Aggregate done tasks per user (these reset to 'paid' after super-admin payout)
  const usersWithDone = (() => {
    const map = new Map<string, { user_id: string; name: string; count: number; lastAt: string; paidCount: number }>();
    completedTasks
      .filter(c => c.status === 'done' || c.status === 'paid')
      .forEach(c => {
        const name = c.executor_name ? c.executor_name.split('@')[0] : 'N/A';
        const prev = map.get(c.user_id);
        const isPaid = c.status === 'paid';
        if (prev) {
          if (isPaid) prev.paidCount += 1;
          else prev.count += 1;
          if (c.created_at > prev.lastAt) prev.lastAt = c.created_at;
        } else {
          map.set(c.user_id, { user_id: c.user_id, name, count: isPaid ? 0 : 1, paidCount: isPaid ? 1 : 0, lastAt: c.created_at });
        }
      });
    return Array.from(map.values()).sort((a, b) => (b.count - a.count) || (b.paidCount - a.paidCount));
  })();

  const openHistory = (user_id: string, name: string) => {
    const items = completedTasks
      .filter(c => c.user_id === user_id && (c.status === 'done' || c.status === 'paid'))
      .map(c => ({
        id: c.id,
        order_number: c.order_number,
        completed_at: (c as any).completed_at ?? c.created_at,
        task_name: c.tasks?.name ?? 'Задание',
        status: c.status,
        task_type: c.tasks?.task_type ?? 'text',
        image_url: c.tasks?.image_url ?? null,
      }));
    setHistoryItems(items);
    setHistoryUser({ user_id, name });
  };

  const splitName = (fullName: string) => {
    const parts = fullName.split(' · ');
    return { restaurant: parts[0], street: parts[1] || '' };
  };

  const filtered = completedTasks.filter(ct =>
    activeTab === 'pending'
      ? (ct.status === 'pending' || ct.status === 'accepted')
      : (ct.status === 'done' || ct.status === 'rejected')
  );

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col">
      <header className="bg-card border-b border-border p-5 sticky top-0 z-30 shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <div>
            <h1 className="text-xl font-black text-foreground">Админ-панель</h1>
            <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">
              Заявок: {completedTasks.filter(c => c.status === 'pending').length}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={openTypeSelect} className="p-2 bg-accent/10 text-accent rounded-full">
              <Plus size={24} />
            </button>
            <button onClick={signOut} className="p-2 bg-destructive/10 text-destructive rounded-full">
              <LogOut size={24} />
            </button>
          </div>
        </div>
        {/* Статистика временно скрыта
        {(() => {
          const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
          const startOfWeek = new Date(); startOfWeek.setDate(startOfWeek.getDate() - 7); startOfWeek.setHours(0,0,0,0);
          const todayPosted = allTasks.filter(t => new Date(t.created_at) >= startOfDay).length;
          const todayDone = completedTasks.filter(c => (c.status === 'done' || c.status === 'paid') && new Date((c as any).completed_at ?? c.created_at) >= startOfDay).length;
          const weekPosted = allTasks.filter(t => new Date(t.created_at) >= startOfWeek).length;
          const weekDone = completedTasks.filter(c => (c.status === 'done' || c.status === 'paid') && new Date((c as any).completed_at ?? c.created_at) >= startOfWeek).length;
          return (
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-primary/5 border border-primary/20 rounded-2xl p-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-1">Сегодня</p>
                <p className="text-[11px] font-bold text-foreground">Выложено: <span className="font-black">{todayPosted}</span></p>
                <p className="text-[11px] font-bold text-foreground">Выполнено: <span className="font-black text-accent">{todayDone}</span></p>
              </div>
              <div className="bg-muted/60 border border-border rounded-2xl p-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">За неделю</p>
                <p className="text-[11px] font-bold text-foreground">Выложено: <span className="font-black">{weekPosted}</span></p>
                <p className="text-[11px] font-bold text-foreground">Выполнено: <span className="font-black text-accent">{weekDone}</span></p>
              </div>
            </div>
          );
        })()}
        */}
        <div className="flex gap-1.5 flex-wrap">
          {(['pending', 'done', 'mytasks', 'users', 'issues', 'archive'] as const).map(tab => {
            const pendingCount = completedTasks.filter(c => c.status === 'pending').length;
            const showDot = tab === 'pending' && pendingCount > 0 && activeTab !== 'pending';
            const needsPayoutCount = usersWithDone.filter(u => u.count >= 10).length;
            const showUsersAlert = tab === 'users' && needsPayoutCount > 0 && activeTab !== 'users';
            const showIssuesAlert = tab === 'issues' && pendingIssues.length > 0 && activeTab !== 'issues';
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`relative flex-1 min-w-[60px] py-2 rounded-xl text-[10px] font-black uppercase ${activeTab === tab ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
              >
                {showDot && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive rounded-full text-[8px] text-destructive-foreground flex items-center justify-center font-black animate-pulse">
                    {pendingCount}
                  </span>
                )}
                {showUsersAlert && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive rounded-full text-[8px] text-destructive-foreground flex items-center justify-center font-black animate-pulse">
                    {needsPayoutCount}
                  </span>
                )}
                {showIssuesAlert && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive rounded-full text-[8px] text-destructive-foreground flex items-center justify-center font-black animate-pulse">
                    {pendingIssues.length}
                  </span>
                )}
                {tab === 'pending' ? 'Заявки' : tab === 'done' ? 'Готовые' : tab === 'mytasks' ? 'Задания' : tab === 'users' ? 'Юзеры' : tab === 'issues' ? 'Вопросы' : 'Архив'}
              </button>
            );
          })}
        </div>
      </header>

      <main className="p-4 space-y-3">
        {activeTab === 'mytasks' && (
          <>
            {activeTasks.length === 0 && (
              <p className="text-center text-muted-foreground py-12">Нет активных заданий</p>
            )}
            {activeTasks.map(task => {
              const { restaurant, street } = splitName(task.name);
              const count = taskExecutorCounts[task.id] || 0;
              return (
                <div key={task.id} className="bg-card p-5 rounded-2xl border border-border shadow-sm space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-black text-foreground text-sm uppercase">{restaurant}</h3>
                      {street && <p className="text-[10px] text-muted-foreground font-bold">{street}</p>}
                      {(() => {
                        const diff = Date.now() - new Date(task.created_at).getTime();
                        if (diff < 60000) return <span className="text-[9px] font-black text-accent uppercase">🆕 Новое</span>;
                        const d = new Date(task.created_at);
                        return <span className="text-[9px] font-black text-muted-foreground">{d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>;
                      })()}
                    </div>
                    <div className="flex items-center gap-1">
                      <Users size={14} className="text-primary" />
                      <span className="text-[10px] font-black text-primary">{count}</span>
                    </div>
                  </div>
                  <Button onClick={() => archiveTask(task.id)} variant="outline" className="w-full font-bold text-xs gap-2">
                    <Archive size={14} /> Архивировать
                  </Button>
                </div>
              );
            })}
          </>
        )}

        {activeTab === 'users' && (
          <>
            {usersWithDone.length === 0 && (
              <p className="text-center text-muted-foreground py-12">Нет выполненных заданий</p>
            )}
            {usersWithDone.map(u => {
              const needsPayout = u.count >= 10;
              return (
                <div
                  key={u.user_id}
                  className={`p-5 rounded-2xl border shadow-sm space-y-3 ${
                    needsPayout ? 'bg-destructive/15 border-destructive' : 'bg-card border-border'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className={`font-black text-sm uppercase ${needsPayout ? 'text-destructive' : 'text-foreground'}`}>{u.name}</h3>
                      <p className="text-[10px] text-muted-foreground font-bold mt-0.5">
                        Последнее: {new Date(u.lastAt).toLocaleDateString('ru-RU')} {u.paidCount > 0 ? `• выплачено: ${u.paidCount}` : ''}
                      </p>
                    </div>
                    <div className={`flex flex-col items-end ${needsPayout ? 'text-destructive' : 'text-primary'}`}>
                      <span className="text-2xl font-black leading-none">{u.count}</span>
                      <span className="text-[9px] font-black uppercase">заданий</span>
                    </div>
                  </div>
                  {needsPayout && (
                    <div className="flex items-center gap-2 bg-destructive text-destructive-foreground rounded-xl px-3 py-2">
                      <AlertTriangle size={14} />
                      <span className="text-[10px] font-black uppercase">Требуется выплата</span>
                    </div>
                  )}
                  <Button
                    onClick={() => openHistory(u.user_id, u.name)}
                    variant="outline"
                    className="w-full font-bold text-xs gap-2"
                  >
                    <History size={14} /> История ({u.count + u.paidCount})
                  </Button>
                </div>
              );
            })}
          </>
        )}

        {activeTab === 'issues' && (
          <>
            {issueReports.length === 0 && (
              <p className="text-center text-muted-foreground py-12">Нет проблем по заказам</p>
            )}
            {issueReports.map(issue => {
              const { restaurant, street } = splitName(issue.tasks?.name ?? 'Задание');
              const isResolved = issue.status === 'resolved';

              return (
                <div
                  key={issue.id}
                  className={`rounded-2xl border p-5 shadow-sm space-y-3 ${isResolved ? 'bg-accent/10 border-accent/30' : 'bg-card border-border'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-black uppercase text-foreground">{restaurant}</h3>
                      {street && <p className="text-[10px] font-bold text-muted-foreground">{street}</p>}
                      <p className="text-[9px] font-bold text-muted-foreground">Исполнитель: {issue.executor_name ? issue.executor_name.split('@')[0] : 'N/A'}</p>
                      <p className="text-[9px] font-bold text-muted-foreground">
                        Отправлено: {new Date(issue.created_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} МСК
                      </p>
                    </div>
                    <span className={`rounded-lg px-2 py-1 text-[9px] font-black uppercase ${isResolved ? 'bg-accent text-accent-foreground' : 'bg-warning/15 text-warning'}`}>
                      {isResolved ? 'Поправили' : 'Ожидает'}
                    </span>
                  </div>

                  <div className="rounded-xl bg-muted p-3">
                    <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Проблема</p>
                    <p className="text-sm font-black text-foreground">{issue.problem_type}</p>
                  </div>

                  {issue.tasks?.link && (
                    <a
                      href={issue.tasks.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-xs font-black text-primary underline-offset-4 hover:underline"
                    >
                      Открыть ресторан
                    </a>
                  )}

                  {!isResolved && (
                    <div className="flex gap-2">
                      <Button onClick={() => resolveIssue(issue.id)} variant="outline" className="flex-1 text-xs font-bold gap-2">
                        <Check size={14} /> Поправили
                      </Button>
                      <Button onClick={() => deleteTaskFromIssue(issue)} variant="destructive" className="flex-1 text-xs font-bold">
                        Удалить задание
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {activeTab === 'archive' && (
          <>
            {/* Filter chips by restaurant tag */}
            {allTasks.some(t => t.status === 'archived') && (
              <div className="bg-card p-3 rounded-2xl border border-border space-y-2">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Filter size={12} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Фильтр по метке</span>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  <button
                    onClick={() => setArchiveFilter('all')}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase ${archiveFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                  >
                    Все
                  </button>
                  {archivedTags.map(tag => (
                    <button
                      key={tag}
                      onClick={() => setArchiveFilter(tag)}
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase gap-1 inline-flex items-center ${archiveFilter === tag ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                    >
                      <Tag size={10} /> {tag}
                    </button>
                  ))}
                  <button
                    onClick={() => setArchiveFilter('__none__')}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase ${archiveFilter === '__none__' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                  >
                    Без метки
                  </button>
                </div>
              </div>
            )}

            {archivedTasks.length === 0 && (
              <p className="text-center text-muted-foreground py-12">Архив пуст</p>
            )}
            {archivedTasks.map(task => {
              const { restaurant, street } = splitName(task.name);
              return (
                <div key={task.id} className="bg-card p-5 rounded-2xl border border-border shadow-sm space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-black text-foreground text-sm uppercase">{restaurant}</h3>
                      {street && <p className="text-[10px] text-muted-foreground font-bold">{street}</p>}
                      {task.restaurant_tag && (
                        <span className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-accent/15 text-accent text-[10px] font-black uppercase">
                          <Tag size={10} /> {task.restaurant_tag}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Archive size={14} className="text-muted-foreground" />
                      <span className="text-[10px] font-black uppercase text-muted-foreground">Архив</span>
                    </div>
                  </div>
                  <Button
                    onClick={() => { setTagTarget(task); setTagInput(task.restaurant_tag ?? ''); }}
                    variant="outline"
                    className="w-full font-bold text-xs gap-2"
                  >
                    <Tag size={14} /> {task.restaurant_tag ? 'Изменить метку' : 'Добавить метку'}
                  </Button>
                  <div className="flex gap-2">
                    <Button onClick={() => unarchiveTask(task.id)} variant="outline" className="flex-1 font-bold text-xs gap-2">
                      <RotateCcw size={14} /> Восстановить
                    </Button>
                    <Button onClick={() => deleteTask(task.id)} variant="destructive" className="flex-1 font-bold text-xs gap-2">
                      Удалить
                    </Button>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {(activeTab === 'pending' || activeTab === 'done') && (
          <>
            {filtered.length === 0 && (
              <p className="text-center text-muted-foreground py-12">Пусто</p>
            )}
            {filtered.map(ct => {
              const { restaurant, street } = splitName(ct.tasks?.name ?? 'Задание');
              const isRejected = ct.status === 'rejected';
              const isReels = ct.tasks?.task_type === 'reels';
              return (
                <div
                  key={ct.id}
                  className={`p-5 rounded-2xl border shadow-sm space-y-3 ${
                    isRejected ? 'bg-destructive/10 border-destructive/40' : 'bg-card border-border'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      {isReels && (
                        <span className="inline-block text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-warning/15 text-warning mb-1">
                          🎬 Рилс · 200₽
                        </span>
                      )}
                      <h3 className="font-black text-foreground text-sm uppercase">{isReels ? (ct.tasks?.name ?? 'Рилс') : restaurant}</h3>
                      {!isReels && street && <p className="text-[10px] text-muted-foreground font-bold">{street}</p>}
                      <p className="text-[9px] text-muted-foreground font-bold">Исполнитель: {ct.executor_name ? ct.executor_name.split('@')[0] : 'N/A'}</p>
                      <p className="text-[9px] text-muted-foreground font-bold">
                        Отправлено: {new Date(ct.created_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} МСК
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {ct.status === 'pending' && <Clock size={14} className="text-warning" />}
                      {ct.status === 'accepted' && <Package size={14} className="text-primary" />}
                      {ct.status === 'done' && <CheckCircle size={14} className="text-accent" />}
                      {ct.status === 'rejected' && <XCircle size={14} className="text-destructive" />}
                      <span className={`text-[10px] font-black uppercase ${isRejected ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {ct.status === 'pending' ? 'Ожидает'
                          : ct.status === 'accepted' ? 'Принят'
                          : ct.status === 'done' ? 'Готово'
                          : 'Отклонено'}
                      </span>
                    </div>
                  </div>
                  {!isReels && (
                    <div className="bg-muted rounded-xl p-3">
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Номер заказа</p>
                      <p className="text-foreground font-black text-lg">{ct.order_number}</p>
                    </div>
                  )}
                  {isReels && (
                    <div className="bg-warning/10 border border-warning/20 rounded-xl p-3">
                      <p className="text-[10px] font-black text-warning uppercase tracking-widest mb-1">Рилс на модерации</p>
                      <p className="text-foreground text-xs font-bold">Исполнитель отправил рилс в Telegram. Проверьте видео и подтвердите.</p>
                    </div>
                  )}
                  {isRejected && ct.reject_reason && (
                    <div className="bg-destructive/15 rounded-xl p-3 border border-destructive/30">
                      <p className="text-[10px] font-black text-destructive uppercase tracking-widest mb-1">Причина отклонения</p>
                      <p className="text-foreground text-xs font-bold">{ct.reject_reason}</p>
                    </div>
                  )}
                  {(ct.status === 'pending' || ct.status === 'accepted') && (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        {ct.status === 'pending' && !isReels && (
                          <Button onClick={() => acceptTask(ct.id)} variant="outline" className="flex-1 font-bold text-xs">
                            Принял заказ
                          </Button>
                        )}
                        <Button onClick={() => completeTask(ct)} className="flex-1 font-bold text-xs bg-accent text-accent-foreground hover:bg-accent/90">
                          {isReels ? 'Подтвердить +200₽' : 'Готово ✓'}
                        </Button>
                      </div>
                      <Button
                        onClick={() => openReject(ct)}
                        variant="outline"
                        className="w-full font-bold text-xs gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Ban size={14} /> Отклонить заявку
                      </Button>
                    </div>
                  )}
                  {isReels && (ct.status === 'done' || ct.status === 'paid') && (
                    <Button
                      onClick={() => awardReelsBonus(ct)}
                      className="w-full font-black text-xs gap-2 bg-warning text-warning-foreground hover:bg-warning/90"
                    >
                      🔥 Начислить бонус +200₽ (5000+ просмотров)
                    </Button>
                  )}
                </div>
              );
            })}
          </>
        )}
      </main>

      {/* Type Select Modal */}
      {showTypeSelect && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-foreground/60 backdrop-blur-sm" onClick={() => setShowTypeSelect(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-card rounded-t-[40px] p-8 pb-12 animate-in slide-in-from-bottom">
            <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mb-6" />
            <h2 className="text-xl font-black text-foreground mb-2">Какое задание создаём?</h2>
            <p className="text-xs text-muted-foreground mb-6">Выберите тип нового задания</p>
            <div className="space-y-3">
              <button
                onClick={() => chooseTaskKind('text')}
                className="w-full p-5 rounded-2xl border-2 border-border hover:border-primary bg-card flex items-center gap-4 text-left transition-all"
              >
                <div className="p-3 bg-primary/10 rounded-2xl text-primary"><FileText size={24} /></div>
                <div className="flex-1">
                  <p className="font-black text-foreground text-sm uppercase">По тексту</p>
                  <p className="text-[11px] text-muted-foreground font-bold">Вставка текста с адресами и ссылкой Яндекс.Еды</p>
                </div>
              </button>
              <button
                onClick={() => chooseTaskKind('image')}
                className="w-full p-5 rounded-2xl border-2 border-border hover:border-accent bg-card flex items-center gap-4 text-left transition-all"
              >
                <div className="p-3 bg-accent/10 rounded-2xl text-accent"><ImageIcon size={24} /></div>
                <div className="flex-1">
                  <p className="font-black text-foreground text-sm uppercase">По картинке</p>
                  <p className="text-[11px] text-muted-foreground font-bold">Загрузка скриншота и адреса доставки</p>
                </div>
              </button>
              {/* Создание заданий «Рилс» временно отключено
              <button
                onClick={() => chooseTaskKind('reels')}
                className="w-full p-5 rounded-2xl border-2 border-border hover:border-warning bg-card flex items-center gap-4 text-left transition-all"
              >
                <div className="p-3 bg-warning/10 rounded-2xl text-warning"><Video size={24} /></div>
                <div className="flex-1">
                  <p className="font-black text-foreground text-sm uppercase">Рилс</p>
                  <p className="text-[11px] text-muted-foreground font-bold">Видео-задание · 200₽ + бонус 200₽ за 5000+ просмотров</p>
                </div>
              </button>
              */}
            </div>
          </div>
        </div>
      )}

      {/* Модалка создания задания «Рилс» временно отключена
      {showAddTask && taskKind === 'reels' && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-foreground/60 backdrop-blur-sm" onClick={() => { if (!submittingReels) { setShowAddTask(false); setTaskKind(null); } }} />
          <div className="absolute bottom-0 left-0 right-0 bg-card rounded-t-[40px] p-6 pb-10 animate-in slide-in-from-bottom max-h-[92vh] overflow-y-auto">
            <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mb-5" />
            <div className="flex items-center gap-2 mb-2">
              <Video size={20} className="text-warning" />
              <h2 className="text-xl font-black text-foreground">Задание на рилс</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">200₽ за рилс + 200₽ бонус за 5000+ просмотров</p>

            <label className="text-[10px] font-black uppercase text-muted-foreground">Название</label>
            <Input
              value={reelsName}
              onChange={e => setReelsName(e.target.value)}
              placeholder="Например: Обзор нового кафе"
              className="mb-3 mt-1 h-11 rounded-xl"
              maxLength={120}
            />

            <label className="text-[10px] font-black uppercase text-muted-foreground">Что нужно снять / смонтировать</label>
            <Textarea
              value={reelsDesc}
              onChange={e => setReelsDesc(e.target.value)}
              placeholder="Подробно опишите сценарий, длительность, обязательные кадры, текст, музыку..."
              className="mb-3 mt-1 min-h-[140px] rounded-xl"
              maxLength={2000}
            />

            <label className="text-[10px] font-black uppercase text-muted-foreground">Ссылка на референс (необязательно)</label>
            <Input
              value={reelsRef}
              onChange={e => setReelsRef(e.target.value)}
              placeholder="https://..."
              className="mb-5 mt-1 h-11 rounded-xl"
              maxLength={500}
            />

            <Button
              onClick={submitReelsTask}
              disabled={submittingReels || !reelsName.trim() || !reelsDesc.trim()}
              className="w-full font-black uppercase bg-warning text-warning-foreground hover:bg-warning/90 rounded-2xl h-14"
            >
              {submittingReels ? 'Создаём...' : 'Создать задание'}
            </Button>
          </div>
        </div>
      )}
      */}

      {/* Add Task Modal */}
      {showAddTask && taskKind === 'text' && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-foreground/60 backdrop-blur-sm" onClick={() => { setShowAddTask(false); setTaskKind(null); }} />
          <div className="absolute bottom-0 left-0 right-0 bg-card rounded-t-[40px] p-8 pb-12 animate-in slide-in-from-bottom">
            <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mb-6" />
            <h2 className="text-xl font-black text-foreground mb-4">Задание по тексту</h2>
            <Textarea
              placeholder="Вставьте текст задания с адресами и ссылкой..."
              value={taskText}
              onChange={e => setTaskText(e.target.value)}
              className="min-h-[200px] mb-4 rounded-2xl"
            />
            <Button onClick={handleParseTask} className="w-full font-black uppercase bg-accent text-accent-foreground hover:bg-accent/90 rounded-2xl h-14 text-base">
              Далее
            </Button>
          </div>
        </div>
      )}

      {/* Add Image Task Modal */}
      {showAddTask && taskKind === 'image' && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-foreground/60 backdrop-blur-sm" onClick={() => { if (!uploadingImage) { setShowAddTask(false); setTaskKind(null); setImageFile(null); setImagePreview(null); setImageAddr(''); } }} />
          <div className="absolute bottom-0 left-0 right-0 bg-card rounded-t-[40px] p-8 pb-12 animate-in slide-in-from-bottom max-h-[90vh] overflow-y-auto">
            <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mb-6" />
            <h2 className="text-xl font-black text-foreground mb-4">Задание по картинке</h2>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => handleImagePick(e.target.files?.[0] ?? null)}
            />

            {imagePreview ? (
              <div className="mb-4 relative">
                <img src={imagePreview} alt="превью" className="w-full rounded-2xl border border-border max-h-[40vh] object-contain bg-muted" />
                <button
                  onClick={() => { setImageFile(null); setImagePreview(null); }}
                  className="absolute top-2 right-2 p-2 bg-destructive text-destructive-foreground rounded-full"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full mb-4 border-2 border-dashed border-border rounded-2xl p-8 flex flex-col items-center gap-3 text-muted-foreground hover:border-accent hover:text-accent transition-all"
              >
                <Upload size={32} />
                <span className="font-black uppercase text-xs">Загрузить картинку</span>
                <span className="text-[10px] font-bold">JPG, PNG — вся информация на картинке</span>
              </button>
            )}

            <label className="text-[10px] font-black text-accent uppercase tracking-widest mb-1 block">Адрес доставки</label>
            <Input
              value={imageAddr}
              onChange={e => setImageAddr(e.target.value)}
              placeholder="г. Москва, ул. ..."
              className="mb-4 rounded-2xl h-12"
            />

            <Button
              onClick={submitImageTask}
              disabled={uploadingImage || !imageFile || !imageAddr.trim()}
              className="w-full font-black uppercase bg-accent text-accent-foreground hover:bg-accent/90 rounded-2xl h-14 text-base"
            >
              {uploadingImage ? 'Загрузка...' : 'Добавить задание'}
            </Button>
          </div>
        </div>
      )}

      {/* Timer Selection Modal */}
      {showTimerSelect && parsedTask && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-foreground/60 backdrop-blur-sm" onClick={() => { setShowTimerSelect(false); setParsedTask(null); }} />
          <div className="absolute bottom-0 left-0 right-0 bg-card rounded-t-[40px] p-8 pb-12 animate-in slide-in-from-bottom">
            <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mb-6" />
            <h2 className="text-xl font-black text-foreground mb-2">Новое задание</h2>
            <p className="text-sm font-bold text-primary mb-1">{parsedTask.name}</p>
            <p className="text-xs text-muted-foreground mb-6">{parsedTask.addr1} → {parsedTask.addr2}</p>

            <p className="text-sm font-black text-foreground mb-3">Сколько времени будет работать наличка у этого ресторана?</p>
            <div className="space-y-2 mb-6">
              {([['30', '30 минут'], ['60', '1 час'], ['none', 'Без таймера']] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setSelectedTimer(val)}
                  className={`w-full py-3 px-4 rounded-2xl text-sm font-bold border-2 transition-all ${
                    selectedTimer === val
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card text-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <Button onClick={confirmAddTask} className="w-full font-black uppercase bg-accent text-accent-foreground hover:bg-accent/90 rounded-2xl h-14 text-base">
              Добавить задание
            </Button>
          </div>
        </div>
      )}

      {/* History Modal */}
      {historyUser && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-foreground/60 backdrop-blur-sm" onClick={() => setHistoryUser(null)} />
          <div className="absolute bottom-0 left-0 right-0 bg-card rounded-t-[40px] p-6 pb-10 max-h-[80vh] flex flex-col animate-in slide-in-from-bottom">
            <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mb-4" />
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-lg font-black text-foreground">История</h2>
                <p className="text-xs text-muted-foreground font-bold">{historyUser.name} · {historyItems.length} записей</p>
              </div>
              <button onClick={() => setHistoryUser(null)} className="p-2 bg-muted rounded-full">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto space-y-2 flex-1">
              {historyItems.length === 0 && (
                <p className="text-center text-muted-foreground py-8 text-sm">Пусто</p>
              )}
              {historyItems.map((item, idx) => {
                const { restaurant, street } = splitName(item.task_name);
                const isImage = item.task_type === 'image';
                return (
                    <div key={item.id} className="bg-muted rounded-xl p-3 flex justify-between items-center gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs font-black text-muted-foreground w-6 shrink-0">#{idx + 1}</span>
                      {isImage && item.image_url ? (
                        <img
                          src={item.image_url}
                          alt="task"
                          className="w-10 h-10 rounded-lg object-cover border border-border shrink-0"
                        />
                      ) : null}
                      <div className="min-w-0">
                        <p className="text-xs font-black text-foreground uppercase truncate flex items-center gap-1">
                          {isImage && <span aria-label="картинка">🖼️</span>}
                          <span className="truncate">{restaurant}</span>
                        </p>
                        {street && <p className="text-[10px] text-muted-foreground font-bold truncate">{street}</p>}
                        <p className="text-[10px] text-muted-foreground font-bold">Заказ: {item.order_number}</p>
                      </div>
                    </div>
                      <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                        <span className={`text-[10px] font-black px-2 py-1 rounded-full ${item.status === 'paid' ? 'bg-accent/10 text-accent' : 'bg-warning/10 text-warning'}`}>
                          {item.status === 'paid' ? 'Выплачено' : 'К выплате'}
                        </span>
                        {item.completed_at && (
                          <span className="text-[10px] font-black text-muted-foreground">
                            {new Date(item.completed_at).toLocaleDateString('ru-RU')}
                          </span>
                        )}
                      </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Reject Reason Modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-foreground/60 backdrop-blur-sm" onClick={() => setRejectTarget(null)} />
          <div className="absolute bottom-0 left-0 right-0 bg-card rounded-t-[40px] p-6 pb-10 max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom">
            <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mb-4" />
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-black text-foreground">Отклонить заявку</h2>
                <p className="text-xs text-muted-foreground font-bold">
                  Заказ {rejectTarget.order_number} · {rejectTarget.executor_name?.split('@')[0] ?? 'N/A'}
                </p>
              </div>
              <button onClick={() => setRejectTarget(null)} className="p-2 bg-muted rounded-full">
                <X size={18} />
              </button>
            </div>

            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">Быстрые причины</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {REJECT_PRESETS.map(p => (
                <button
                  key={p}
                  onClick={() => setRejectReason(p)}
                  className={`px-3 py-2 rounded-xl text-[11px] font-bold border transition-all ${
                    rejectReason === p
                      ? 'border-destructive bg-destructive/15 text-destructive'
                      : 'border-border bg-muted text-foreground'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">Причина</p>
            <Textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Опишите причину отклонения..."
              className="min-h-[100px] mb-4 rounded-2xl"
            />

            <div className="flex gap-2">
              <Button
                onClick={() => setRejectTarget(null)}
                variant="outline"
                className="flex-1 font-black uppercase rounded-2xl h-12"
              >
                Отмена
              </Button>
              <Button
                onClick={submitReject}
                disabled={!rejectReason.trim()}
                variant="destructive"
                className="flex-1 font-black uppercase rounded-2xl h-12 gap-2"
              >
                <Ban size={16} /> Отклонить
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Tag edit modal */}
      {tagTarget && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-foreground/60 backdrop-blur-sm" onClick={() => { setTagTarget(null); setTagInput(''); }} />
          <div className="absolute bottom-0 left-0 right-0 bg-card rounded-t-[40px] p-8 pb-12 animate-in slide-in-from-bottom">
            <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mb-6" />
            <div className="flex items-center gap-2 mb-2">
              <Tag size={20} className="text-accent" />
              <h2 className="text-xl font-black text-foreground">Метка ресторана</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Сгруппируйте задания одной меткой (например, «Таганка 1»), чтобы фильтровать архив.
            </p>

            {archivedTags.length > 0 && (
              <div className="mb-4">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">Существующие метки</p>
                <div className="flex gap-1.5 flex-wrap">
                  {archivedTags.map(tag => (
                    <button
                      key={tag}
                      onClick={() => setTagInput(tag)}
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase gap-1 inline-flex items-center ${tagInput === tag ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'}`}
                    >
                      <Tag size={10} /> {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Input
              placeholder="Например: Таганка 1"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              className="rounded-2xl h-12 mb-4"
              autoFocus
            />

            <div className="flex gap-3">
              <Button
                onClick={() => { setTagTarget(null); setTagInput(''); }}
                variant="outline"
                className="flex-1 font-black uppercase rounded-2xl h-12"
              >
                Отмена
              </Button>
              {tagTarget.restaurant_tag && (
                <Button
                  onClick={() => { setTagInput(''); saveTag(); }}
                  variant="destructive"
                  className="font-black uppercase rounded-2xl h-12 px-4"
                >
                  Снять
                </Button>
              )}
              <Button
                onClick={saveTag}
                className="flex-1 font-black uppercase rounded-2xl h-12 bg-accent text-accent-foreground hover:bg-accent/90 gap-2"
              >
                <Check size={16} /> Сохранить
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
