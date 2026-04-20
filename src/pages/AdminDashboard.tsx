import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { LogOut, Plus, CheckCircle, Clock, Package, Archive, RotateCcw, Users, History, X, AlertTriangle, FileText, Image as ImageIcon, Upload } from 'lucide-react';

interface CompletedTask {
  id: string;
  order_number: string;
  status: string;
  created_at: string;
  user_id: string;
  task_id: string;
  tasks: { task_id: string; name: string } | null;
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
  const [activeTab, setActiveTab] = useState<'pending' | 'done' | 'archive' | 'mytasks' | 'users'>('mytasks');
  const [taskExecutorCounts, setTaskExecutorCounts] = useState<Record<string, number>>({});
  const [historyUser, setHistoryUser] = useState<{ user_id: string; name: string } | null>(null);
  const [historyItems, setHistoryItems] = useState<Array<{ id: string; order_number: string; completed_at: string | null; task_name: string }>>([]);

  // Add task flow
  const [showTypeSelect, setShowTypeSelect] = useState(false);
  const [taskKind, setTaskKind] = useState<'text' | 'image' | null>(null);

  // Image task state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageAddr, setImageAddr] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Timer selection state
  const [parsedTask, setParsedTask] = useState<ReturnType<typeof parseTaskText>>(null);
  const [showTimerSelect, setShowTimerSelect] = useState(false);
  const [selectedTimer, setSelectedTimer] = useState<'30' | '60' | 'none'>('none');

  useEffect(() => {
    loadCompletedTasks();
    loadAllTasks();
    loadExecutorCounts();
    const interval = setInterval(checkExpiredTasks, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadAllTasks = async () => {
    const { data } = await supabase
      .from('tasks')
      .select('id, task_id, name, status, expires_at, created_at')
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
      .select('*, tasks(task_id, name)')
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

  const acceptTask = async (id: string) => {
    await supabase.from('completed_tasks').update({ status: 'accepted', accepted_at: new Date().toISOString() }).eq('id', id);
    loadCompletedTasks();
    toast({ title: 'Заказ принят' });
  };

  const completeTask = async (ct: CompletedTaskWithProfile) => {
    await supabase.from('completed_tasks').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', ct.id);
    const { data: profile } = await supabase.from('profiles').select('balance').eq('user_id', ct.user_id).single();
    if (profile) {
      await supabase.from('profiles').update({ balance: profile.balance + 20 }).eq('user_id', ct.user_id);
    }
    loadCompletedTasks();
    toast({ title: 'Готово!' });
  };

  const openTypeSelect = () => {
    setShowTypeSelect(true);
  };

  const chooseTaskKind = (kind: 'text' | 'image') => {
    setTaskKind(kind);
    setShowTypeSelect(false);
    setShowAddTask(true);
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
    await supabase.from('tasks').delete().eq('id', taskId);
    loadAllTasks();
    toast({ title: 'Задание удалено' });
  };

  const archivedTasks = allTasks.filter(t => t.status === 'archived');
  const activeTasks = allTasks.filter(t => t.status === 'available');

  // Aggregate done tasks per user (these reset to 'paid' after super-admin payout)
  const usersWithDone = (() => {
    const map = new Map<string, { user_id: string; name: string; count: number; lastAt: string }>();
    completedTasks
      .filter(c => c.status === 'done')
      .forEach(c => {
        const name = c.executor_name ? c.executor_name.split('@')[0] : 'N/A';
        const prev = map.get(c.user_id);
        if (prev) {
          prev.count += 1;
          if (c.created_at > prev.lastAt) prev.lastAt = c.created_at;
        } else {
          map.set(c.user_id, { user_id: c.user_id, name, count: 1, lastAt: c.created_at });
        }
      });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  })();

  const openHistory = (user_id: string, name: string) => {
    const items = completedTasks
      .filter(c => c.user_id === user_id && c.status === 'done')
      .map(c => ({
        id: c.id,
        order_number: c.order_number,
        completed_at: (c as any).completed_at ?? c.created_at,
        task_name: c.tasks?.name ?? 'Задание',
      }));
    setHistoryItems(items);
    setHistoryUser({ user_id, name });
  };

  const splitName = (fullName: string) => {
    const parts = fullName.split(' · ');
    return { restaurant: parts[0], street: parts[1] || '' };
  };

  const filtered = completedTasks.filter(ct =>
    activeTab === 'pending' ? ct.status !== 'done' : ct.status === 'done'
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
            <button onClick={() => setShowAddTask(true)} className="p-2 bg-accent/10 text-accent rounded-full">
              <Plus size={24} />
            </button>
            <button onClick={signOut} className="p-2 bg-destructive/10 text-destructive rounded-full">
              <LogOut size={24} />
            </button>
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(['pending', 'done', 'mytasks', 'users', 'archive'] as const).map(tab => {
            const pendingCount = completedTasks.filter(c => c.status === 'pending').length;
            const showDot = tab === 'pending' && pendingCount > 0 && activeTab !== 'pending';
            const needsPayoutCount = usersWithDone.filter(u => u.count >= 10).length;
            const showUsersAlert = tab === 'users' && needsPayoutCount > 0 && activeTab !== 'users';
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
                {tab === 'pending' ? 'Заявки' : tab === 'done' ? 'Готовые' : tab === 'mytasks' ? 'Задания' : tab === 'users' ? 'Юзеры' : 'Архив'}
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
                        Последнее: {new Date(u.lastAt).toLocaleDateString('ru-RU')}
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
                    <History size={14} /> История ({u.count})
                  </Button>
                </div>
              );
            })}
          </>
        )}

        {activeTab === 'archive' && (
          <>
            {archivedTasks.length === 0 && (
              <p className="text-center text-muted-foreground py-12">Архив пуст</p>
            )}
            {archivedTasks.map(task => {
              const { restaurant, street } = splitName(task.name);
              return (
                <div key={task.id} className="bg-card p-5 rounded-2xl border border-border shadow-sm space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-black text-foreground text-sm uppercase">{restaurant}</h3>
                      {street && <p className="text-[10px] text-muted-foreground font-bold">{street}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      <Archive size={14} className="text-muted-foreground" />
                      <span className="text-[10px] font-black uppercase text-muted-foreground">Архив</span>
                    </div>
                  </div>
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
              return (
                <div key={ct.id} className="bg-card p-5 rounded-2xl border border-border shadow-sm space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-black text-foreground text-sm uppercase">{restaurant}</h3>
                      {street && <p className="text-[10px] text-muted-foreground font-bold">{street}</p>}
                      <p className="text-[9px] text-muted-foreground font-bold">Исполнитель: {ct.executor_name ? ct.executor_name.split('@')[0] : 'N/A'}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {ct.status === 'pending' && <Clock size={14} className="text-warning" />}
                      {ct.status === 'accepted' && <Package size={14} className="text-primary" />}
                      {ct.status === 'done' && <CheckCircle size={14} className="text-accent" />}
                      <span className="text-[10px] font-black uppercase text-muted-foreground">
                        {ct.status === 'pending' ? 'Ожидает' : ct.status === 'accepted' ? 'Принят' : 'Готово'}
                      </span>
                    </div>
                  </div>
                  <div className="bg-muted rounded-xl p-3">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Номер заказа</p>
                    <p className="text-foreground font-black text-lg">{ct.order_number}</p>
                  </div>
                  {ct.status !== 'done' && (
                    <div className="flex gap-2">
                      {ct.status === 'pending' && (
                        <Button onClick={() => acceptTask(ct.id)} variant="outline" className="flex-1 font-bold text-xs">
                          Принял заказ
                        </Button>
                      )}
                      <Button onClick={() => completeTask(ct)} className="flex-1 font-bold text-xs bg-accent text-accent-foreground hover:bg-accent/90">
                        Готово ✓
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </main>

      {/* Add Task Modal */}
      {showAddTask && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-foreground/60 backdrop-blur-sm" onClick={() => setShowAddTask(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-card rounded-t-[40px] p-8 pb-12 animate-in slide-in-from-bottom">
            <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mb-6" />
            <h2 className="text-xl font-black text-foreground mb-4">Добавить задание</h2>
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
                <p className="text-xs text-muted-foreground font-bold">{historyUser.name} · {historyItems.length} заданий</p>
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
                return (
                  <div key={item.id} className="bg-muted rounded-xl p-3 flex justify-between items-center">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs font-black text-muted-foreground w-6 shrink-0">#{idx + 1}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-black text-foreground uppercase truncate">{restaurant}</p>
                        {street && <p className="text-[10px] text-muted-foreground font-bold truncate">{street}</p>}
                        <p className="text-[10px] text-muted-foreground font-bold">Заказ: {item.order_number}</p>
                      </div>
                    </div>
                    {item.completed_at && (
                      <span className="text-[10px] font-black text-muted-foreground shrink-0 ml-2">
                        {new Date(item.completed_at).toLocaleDateString('ru-RU')}
                      </span>
                    )}
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
