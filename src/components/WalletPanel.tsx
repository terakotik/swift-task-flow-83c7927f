import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Wallet, X, Clock, CheckCircle, XCircle, TrendingUp, History, Send, ChevronRight } from 'lucide-react';

const MIN_PAYOUT = 200;

type Method = 'sbp' | 'usdt_trc20';

interface PayoutRequest {
  id: string;
  amount: number;
  method: Method;
  details: any;
  comment: string | null;
  status: 'pending' | 'paid' | 'rejected';
  reject_reason: string | null;
  created_at: string;
  processed_at: string | null;
}

interface Stats {
  today: number;
  week: number;
  month: number;
  total: number;
  totalEarned: number;
}

interface Props {
  userId: string;
  balance: number;
  onClose: () => void;
  onBalanceChanged: () => void;
}

export function WalletPanel({ userId, balance, onClose, onBalanceChanged }: Props) {
  const { toast } = useToast();
  const [view, setView] = useState<'main' | 'request' | 'history'>('main');
  const [requests, setRequests] = useState<PayoutRequest[]>([]);
  const [stats, setStats] = useState<Stats>({ today: 0, week: 0, month: 0, total: 0, totalEarned: 0 });
  const [loading, setLoading] = useState(true);

  // form
  const [amount, setAmount] = useState<string>(String(balance >= MIN_PAYOUT ? balance : MIN_PAYOUT));
  const [method, setMethod] = useState<Method>('sbp');
  const [phone, setPhone] = useState('');
  const [bank, setBank] = useState('');
  const [wallet, setWallet] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: reqs }, { data: completed }, { data: paid }] = await Promise.all([
      (supabase as any).from('payout_requests').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('completed_tasks').select('created_at, status').eq('user_id', userId),
      (supabase as any).from('payout_requests').select('amount').eq('user_id', userId).eq('status', 'paid'),
    ]);
    setRequests((reqs as PayoutRequest[]) ?? []);

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfWeek = startOfDay - 6 * 24 * 60 * 60 * 1000;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const list = (completed ?? []).filter((c: any) => c.status !== 'rejected');
    let today = 0, week = 0, month = 0;
    for (const c of list) {
      const t = new Date(c.created_at).getTime();
      if (t >= startOfDay) today++;
      if (t >= startOfWeek) week++;
      if (t >= startOfMonth) month++;
    }
    const totalEarned = (paid ?? []).reduce((s: number, p: any) => s + Number(p.amount), 0);
    setStats({ today, week, month, total: list.length, totalEarned });
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const pending = requests.find(r => r.status === 'pending');

  const submitRequest = async () => {
    const amt = Number(amount);
    if (!amt || amt < MIN_PAYOUT) {
      toast({ title: `Минимум ${MIN_PAYOUT}₽`, variant: 'destructive' });
      return;
    }
    if (amt > balance) {
      toast({ title: 'Недостаточно средств', description: `Доступно: ${balance}₽`, variant: 'destructive' });
      return;
    }
    let details: Record<string, string> = {};
    if (method === 'sbp') {
      if (!phone.trim() || !bank.trim()) {
        toast({ title: 'Укажите телефон и банк', variant: 'destructive' });
        return;
      }
      details = { phone: phone.trim(), bank: bank.trim() };
    } else {
      if (!wallet.trim() || wallet.trim().length < 20) {
        toast({ title: 'Укажите корректный USDT TRC20 адрес', variant: 'destructive' });
        return;
      }
      details = { wallet: wallet.trim() };
    }

    setSubmitting(true);
    const { data, error } = await (supabase as any).rpc('create_payout_request', {
      _amount: amt,
      _method: method,
      _details: details,
      _comment: comment,
    });
    setSubmitting(false);

    if (error) {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
      return;
    }
    if (data && !data.ok) {
      const map: Record<string, string> = {
        min_amount: `Минимум ${MIN_PAYOUT}₽`,
        pending_exists: 'У вас уже есть активная заявка',
        insufficient_balance: 'Недостаточно средств на балансе',
        unauthorized: 'Не авторизован',
        invalid_method: 'Неверный способ выплаты',
      };
      toast({ title: map[data.error] || 'Не удалось создать заявку', variant: 'destructive' });
      return;
    }
    toast({ title: '✅ Заявка отправлена!', description: 'Сумма заморожена. Ожидайте подтверждения.' });
    setView('main');
    setComment('');
    onBalanceChanged();
    load();
  };

  const fmt = (d: string) => new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

  const statusBadge = (s: PayoutRequest['status']) => {
    if (s === 'pending') return <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-warning bg-warning/10 px-2 py-1 rounded-full"><Clock size={11} /> В обработке</span>;
    if (s === 'paid') return <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-accent bg-accent/10 px-2 py-1 rounded-full"><CheckCircle size={11} /> Выплачено</span>;
    return <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-destructive bg-destructive/10 px-2 py-1 rounded-full"><XCircle size={11} /> Отклонено</span>;
  };

  const methodLabel = (m: Method) => m === 'sbp' ? 'СБП' : 'USDT TRC20';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-foreground/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background w-full max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl p-5 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet size={22} className="text-primary" />
            <h2 className="text-xl font-black">Мой кошелёк</h2>
          </div>
          <button onClick={onClose} className="p-2 bg-muted rounded-full"><X size={18} /></button>
        </div>

        {view === 'main' && (
          <>
            {/* Balance hero */}
            <div className="bg-gradient-to-br from-primary to-accent text-primary-foreground rounded-3xl p-5 shadow-lg">
              <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Доступно к выводу</p>
              <p className="text-5xl font-black mt-1">{balance}<span className="text-2xl">₽</span></p>
              {pending && (
                <p className="text-[11px] font-bold opacity-90 mt-2">
                  В обработке: {pending.amount}₽ ({methodLabel(pending.method)})
                </p>
              )}
              <Button
                onClick={() => { setAmount(String(balance >= MIN_PAYOUT ? balance : MIN_PAYOUT)); setView('request'); }}
                disabled={!!pending || balance < MIN_PAYOUT}
                className="w-full mt-4 bg-background text-foreground hover:bg-background/90 font-black h-12 rounded-2xl"
              >
                {pending ? 'Заявка уже отправлена' : balance < MIN_PAYOUT ? `Минимум для вывода: ${MIN_PAYOUT}₽` : '💸 Заказать выплату'}
              </Button>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-2">
              <StatBox label="Сегодня" value={stats.today} suffix="зад." />
              <StatBox label="Неделя" value={stats.week} suffix="зад." />
              <StatBox label="Месяц" value={stats.month} suffix="зад." />
              <StatBox label="Всего" value={stats.total} suffix="зад." />
            </div>

            <div className="bg-accent/5 rounded-2xl p-4 flex items-center justify-between border border-accent/20">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Всего выплачено</p>
                <p className="text-2xl font-black text-accent">{stats.totalEarned}₽</p>
              </div>
              <TrendingUp className="text-accent" size={28} />
            </div>

            {/* History button */}
            <button
              onClick={() => setView('history')}
              className="w-full bg-muted rounded-2xl p-4 flex items-center justify-between active:scale-[0.99] transition-transform"
            >
              <div className="flex items-center gap-2">
                <History size={18} className="text-foreground" />
                <span className="font-black text-sm">История выплат</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs font-bold text-muted-foreground">{requests.length}</span>
                <ChevronRight size={16} className="text-muted-foreground" />
              </div>
            </button>

            <p className="text-[10px] text-muted-foreground text-center px-4">
              Новые задания продолжают копиться, пока заявка в обработке.
              После подтверждения админом средства уйдут в историю.
            </p>
          </>
        )}

        {view === 'request' && (
          <div className="space-y-4">
            <button onClick={() => setView('main')} className="text-primary text-xs font-black">← Назад</button>
            <h3 className="text-lg font-black">Заказать выплату</h3>

            <div>
              <Label className="text-xs font-black uppercase">Сумма (доступно {balance}₽)</Label>
              <Input
                type="number"
                inputMode="numeric"
                min={MIN_PAYOUT}
                max={balance}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="text-2xl font-black h-14 mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Минимум: {MIN_PAYOUT}₽</p>
            </div>

            <div>
              <Label className="text-xs font-black uppercase mb-2 block">Способ выплаты</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMethod('sbp')}
                  className={`p-3 rounded-2xl border-2 text-sm font-black ${method === 'sbp' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted text-muted-foreground'}`}
                >
                  💳 СБП
                </button>
                <button
                  type="button"
                  onClick={() => setMethod('usdt_trc20')}
                  className={`p-3 rounded-2xl border-2 text-sm font-black ${method === 'usdt_trc20' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted text-muted-foreground'}`}
                >
                  ₮ USDT
                </button>
              </div>
            </div>

            {method === 'sbp' ? (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs font-black uppercase">Телефон (СБП)</Label>
                  <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+7 999 123-45-67" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-black uppercase">Банк-получатель</Label>
                  <Input value={bank} onChange={e => setBank(e.target.value)} placeholder="Сбер, Тинькофф, Альфа..." className="mt-1" />
                </div>
              </div>
            ) : (
              <div>
                <Label className="text-xs font-black uppercase">USDT TRC20 адрес</Label>
                <Input value={wallet} onChange={e => setWallet(e.target.value)} placeholder="T..." className="mt-1 font-mono text-xs" />
              </div>
            )}

            <div>
              <Label className="text-xs font-black uppercase">Комментарий (необязательно)</Label>
              <Input value={comment} onChange={e => setComment(e.target.value)} className="mt-1" />
            </div>

            <Button onClick={submitRequest} disabled={submitting} className="w-full h-12 rounded-2xl font-black">
              <Send size={16} className="mr-2" />
              {submitting ? 'Отправка...' : 'Отправить заявку'}
            </Button>
          </div>
        )}

        {view === 'history' && (
          <div className="space-y-3">
            <button onClick={() => setView('main')} className="text-primary text-xs font-black">← Назад</button>
            <h3 className="text-lg font-black">История выплат</h3>
            {loading ? (
              <p className="text-center text-muted-foreground text-sm py-6">Загрузка...</p>
            ) : requests.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-6">Пока нет заявок</p>
            ) : (
              <div className="space-y-2">
                {requests.map(r => (
                  <div key={r.id} className="bg-muted/50 rounded-2xl p-3 border border-border">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-lg font-black">{r.amount}₽</span>
                      {statusBadge(r.status)}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {methodLabel(r.method)} · {fmt(r.created_at)}
                    </p>
                    {r.method === 'sbp' && r.details?.phone && (
                      <p className="text-[11px] text-foreground mt-1">{r.details.phone} · {r.details.bank}</p>
                    )}
                    {r.method === 'usdt_trc20' && r.details?.wallet && (
                      <p className="text-[10px] font-mono text-foreground mt-1 break-all">{r.details.wallet}</p>
                    )}
                    {r.processed_at && r.status === 'paid' && (
                      <p className="text-[10px] text-accent font-bold mt-1">✓ Выплачено: {fmt(r.processed_at)}</p>
                    )}
                    {r.status === 'rejected' && r.reject_reason && (
                      <p className="text-[10px] text-destructive font-bold mt-1">Причина: {r.reject_reason}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, suffix }: { label: string; value: number; suffix: string }) {
  return (
    <div className="bg-muted rounded-2xl p-3">
      <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-2xl font-black text-foreground">{value}<span className="text-xs text-muted-foreground ml-1">{suffix}</span></p>
    </div>
  );
}
