import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Clock, CheckCircle, XCircle, Copy, Send } from 'lucide-react';

interface PayoutRequestRow {
  id: string;
  user_id: string;
  amount: number;
  method: 'sbp' | 'usdt_trc20';
  details: any;
  comment: string | null;
  status: 'pending' | 'paid' | 'rejected';
  reject_reason: string | null;
  created_at: string;
  processed_at: string | null;
  display_name?: string;
  email?: string;
}

export function AdminPayoutRequests() {
  const { toast } = useToast();
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [rows, setRows] = useState<PayoutRequestRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [rejectFor, setRejectFor] = useState<PayoutRequestRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data: reqs } = await (supabase as any)
      .from('payout_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    const list = (reqs as PayoutRequestRow[]) ?? [];
    const ids = Array.from(new Set(list.map(r => r.user_id)));
    if (ids.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, display_name, email')
        .in('user_id', ids);
      const map = new Map<string, any>((profs ?? []).map((p: any) => [p.user_id, p]));
      list.forEach(r => {
        const p = map.get(r.user_id);
        r.display_name = p?.display_name;
        r.email = p?.email;
      });
    }
    setRows(list);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const approve = async (r: PayoutRequestRow) => {
    if (!confirm(`Подтвердить выплату ${r.amount}₽ для ${r.display_name || r.email}?`)) return;
    const { data, error } = await (supabase as any).rpc('approve_payout_request', { _request_id: r.id });
    if (error || !data?.ok) {
      toast({ title: 'Ошибка', description: error?.message || data?.error || '—', variant: 'destructive' });
      return;
    }
    toast({ title: '✅ Выплата подтверждена', description: `${r.amount}₽ выплачено` });
    load();
  };

  const reject = async () => {
    if (!rejectFor) return;
    const { data, error } = await (supabase as any).rpc('reject_payout_request', {
      _request_id: rejectFor.id,
      _reason: rejectReason,
    });
    if (error || !data?.ok) {
      toast({ title: 'Ошибка', description: error?.message || data?.error || '—', variant: 'destructive' });
      return;
    }
    toast({ title: 'Заявка отклонена', description: 'Деньги возвращены пользователю' });
    setRejectFor(null);
    setRejectReason('');
    load();
  };

  const copy = (t: string) => {
    navigator.clipboard.writeText(t);
    toast({ title: 'Скопировано' });
  };

  const fmt = (d: string) => new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

  const filtered = rows.filter(r => tab === 'pending' ? r.status === 'pending' : r.status !== 'pending');
  const pendingCount = rows.filter(r => r.status === 'pending').length;
  const pendingSum = rows.filter(r => r.status === 'pending').reduce((s, r) => s + Number(r.amount), 0);

  return (
    <section className="bg-card rounded-2xl border border-border shadow-sm p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-foreground uppercase tracking-widest">Заявки на выплату</h2>
          <p className="text-[10px] text-muted-foreground font-bold mt-1">
            Юзеры заказывают выплату — здесь подтверждаешь или отклоняешь.
          </p>
        </div>
        {pendingCount > 0 && (
          <div className="bg-warning/10 rounded-xl px-3 py-2 text-right">
            <p className="text-[9px] font-black uppercase text-warning">Ждут</p>
            <p className="text-lg font-black text-warning">{pendingSum}₽ · {pendingCount}</p>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setTab('pending')}
          className={`flex-1 py-2 rounded-xl text-xs font-black uppercase ${tab === 'pending' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
        >
          Активные ({pendingCount})
        </button>
        <button
          onClick={() => setTab('history')}
          className={`flex-1 py-2 rounded-xl text-xs font-black uppercase ${tab === 'history' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
        >
          История
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground text-center py-4">Загрузка...</p>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">Пусто</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => (
            <div key={r.id} className="bg-muted/40 rounded-2xl p-3 border border-border space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-black truncate">{r.display_name || r.email || r.user_id.slice(0, 8)}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{r.email}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black">{r.amount}₽</p>
                  <p className="text-[9px] font-black uppercase text-muted-foreground">{r.method === 'sbp' ? 'СБП' : 'USDT'}</p>
                </div>
              </div>

              <div className="bg-background rounded-xl p-2 text-[11px] space-y-1">
                {r.method === 'sbp' && (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Телефон:</span>
                      <button onClick={() => copy(r.details?.phone || '')} className="font-mono font-bold flex items-center gap-1">
                        {r.details?.phone || '—'} <Copy size={11} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Банк:</span>
                      <span className="font-bold">{r.details?.bank || '—'}</span>
                    </div>
                  </>
                )}
                {r.method === 'usdt_trc20' && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground shrink-0">USDT:</span>
                    <button onClick={() => copy(r.details?.wallet || '')} className="font-mono font-bold flex items-center gap-1 truncate">
                      <span className="truncate">{r.details?.wallet || '—'}</span> <Copy size={11} className="shrink-0" />
                    </button>
                  </div>
                )}
                {r.comment && (
                  <p className="text-muted-foreground italic">«{r.comment}»</p>
                )}
                <p className="text-[10px] text-muted-foreground pt-1 border-t border-border">
                  Создано: {fmt(r.created_at)}
                  {r.processed_at && ` · Обработано: ${fmt(r.processed_at)}`}
                </p>
                {r.reject_reason && (
                  <p className="text-[10px] text-destructive font-bold">Отклонено: {r.reject_reason}</p>
                )}
              </div>

              {r.status === 'pending' ? (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => approve(r)} className="flex-1 h-9 text-xs font-black">
                    <CheckCircle size={14} className="mr-1" /> Выплачено
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => setRejectFor(r)} className="flex-1 h-9 text-xs font-black">
                    <XCircle size={14} className="mr-1" /> Отклонить
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-end">
                  {r.status === 'paid' ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-accent bg-accent/10 px-2 py-1 rounded-full">
                      <CheckCircle size={11} /> Выплачено
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-destructive bg-destructive/10 px-2 py-1 rounded-full">
                      <XCircle size={11} /> Отклонено
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!rejectFor} onOpenChange={(o) => !o && setRejectFor(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Отклонить заявку?</DialogTitle>
            <DialogDescription>
              Деньги ({rejectFor?.amount}₽) вернутся пользователю на баланс.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Причина (видна юзеру)"
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectFor(null)}>Отмена</Button>
            <Button variant="destructive" onClick={reject}>Отклонить и вернуть деньги</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
