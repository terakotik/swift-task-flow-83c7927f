import { Button } from '@/components/ui/button';
import { X, Utensils, MessageSquare, CheckCircle2, Lock, Video } from 'lucide-react';

interface Props {
  onClose: () => void;
}

export function OffersPanel({ onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-foreground/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background w-full max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl p-5 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black">Мои офферы</h2>
          <button onClick={onClose} className="p-2 bg-muted rounded-full"><X size={18} /></button>
        </div>

        <p className="text-xs text-muted-foreground">
          Подключай офферы и получай задания по выбранным направлениям.
        </p>

        {/* Restaurants — connected by default */}
        <div className="rounded-3xl p-5 bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-lg">
          <div className="flex items-start justify-between">
            <div className="bg-background/20 rounded-2xl p-3">
              <Utensils size={24} />
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase bg-background/25 px-2 py-1 rounded-full">
              <CheckCircle2 size={11} /> Подключён
            </span>
          </div>
          <h3 className="text-2xl font-black mt-3">Рестораны</h3>
          <p className="text-xs opacity-90 mt-1">
            Размещение заказов в заведениях. Базовый оффер — подключён всем по умолчанию.
          </p>
          <div className="flex items-center gap-3 mt-3 text-[11px] font-bold opacity-90">
            <span>💰 от 20₽/задание</span>
            <span>•</span>
            <span>📸 +20₽ с фото</span>
          </div>
          <Button disabled className="w-full mt-4 bg-background/20 text-primary-foreground hover:bg-background/20 font-black h-11 rounded-2xl disabled:opacity-100">
            Активен
          </Button>
        </div>

        {/* Reels — connected by default */}
        <div className="rounded-3xl p-5 bg-gradient-to-br from-accent via-primary to-warning text-primary-foreground shadow-lg">
          <div className="flex items-start justify-between">
            <div className="bg-background/20 rounded-2xl p-3">
              <Video size={24} />
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase bg-background/25 px-2 py-1 rounded-full">
              <CheckCircle2 size={11} /> Подключён
            </span>
          </div>
          <h3 className="text-2xl font-black mt-3">Рилсы</h3>
          <p className="text-xs opacity-90 mt-1">
            Снимай короткие видео по техзаданию и отправляй админу на модерацию в Telegram.
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-[11px] font-bold opacity-90">
            <span>🎬 200₽ за рилс</span>
            <span>•</span>
            <span>🔥 +200₽ бонус за 5000+ просмотров</span>
          </div>
          <Button disabled className="w-full mt-4 bg-background/20 text-primary-foreground hover:bg-background/20 font-black h-11 rounded-2xl disabled:opacity-100">
            Активен
          </Button>
        </div>

        {/* Comments — coming soon */}
        <div className="rounded-3xl p-5 bg-muted border-2 border-dashed border-border relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div className="bg-background rounded-2xl p-3">
              <MessageSquare size={24} className="text-muted-foreground" />
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase bg-warning/15 text-warning px-2 py-1 rounded-full">
              <Lock size={11} /> Скоро
            </span>
          </div>
          <h3 className="text-2xl font-black mt-3 text-foreground">Комментарии</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Написание отзывов и комментариев в соцсетях и на картах.
          </p>
          <div className="flex items-center gap-3 mt-3 text-[11px] font-bold text-muted-foreground">
            <span>💬 Пока недоступно</span>
          </div>
          <Button disabled className="w-full mt-4 h-11 rounded-2xl font-black" variant="secondary">
            Подключить
          </Button>
        </div>

        <p className="text-[10px] text-muted-foreground text-center px-4">
          Новые офферы появятся в ближайшее время. Следи за обновлениями!
        </p>
      </div>
    </div>
  );
}
