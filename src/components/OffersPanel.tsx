import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { X, Utensils, MessageSquare, CheckCircle2, Lock, Info } from 'lucide-react';

interface Props {
  onClose: () => void;
}

export function OffersPanel({ onClose }: Props) {
  const [showInstruction, setShowInstruction] = useState(false);

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
            <span>💰 20₽/задание</span>
            <span>•</span>
            <span>📸 30₽/задание по картинке</span>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <Button disabled className="bg-background/20 text-primary-foreground hover:bg-background/20 font-black h-11 rounded-2xl disabled:opacity-100">
              Активен
            </Button>
            <Button
              onClick={() => setShowInstruction(true)}
              className="bg-background text-primary hover:bg-background/90 font-black h-11 rounded-2xl gap-1"
            >
              <Info size={16} /> Инструкция
            </Button>
          </div>
        </div>

        {/* Reels offer — temporarily hidden */}
        {/*
        <div className="rounded-3xl p-5 bg-gradient-to-br from-accent via-primary to-warning text-primary-foreground shadow-lg">
          ... reels block commented out ...
        </div>
        */}

        {/* Video edit offer — temporarily hidden */}
        {/*
        <div className="rounded-3xl p-5 bg-gradient-to-br from-warning via-accent to-primary text-primary-foreground shadow-lg">
          ... video edit block commented out ...
        </div>
        */}

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

      {/* Instruction modal */}
      {showInstruction && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center">
          <div className="absolute inset-0 bg-foreground/70 backdrop-blur-sm" onClick={() => setShowInstruction(false)} />
          <div className="relative bg-card w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-[40px] p-6 pb-10 shadow-2xl animate-in slide-in-from-bottom">
            <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mb-5" />
            <h2 className="text-2xl font-black text-foreground mb-3">Инструкция</h2>
            <p className="text-xs font-bold text-warning mb-5">
              Только если у вас есть старый аккаунт Яндекс Go 👇 (на котором вы ранее делали заказ такси или еды)
            </p>
            <div className="space-y-3 text-sm text-muted-foreground font-medium">
              <p>1. Вводим адрес в приложении <b className="text-foreground">Яндекс Еда</b>.</p>
              <p className="pl-3">Адрес: <b className="text-foreground">А</b></p>
              <p>2. В поиске ищем ресторан.</p>
              <p>3. Заходим в него и выбираем <b className="text-foreground">соус васаби</b>.</p>
              <p>4. Меняем адрес на:</p>
              <p className="pl-3">Адрес <b className="text-foreground">Б</b></p>
              <p>5. Переходим в корзину и нажимаем <b className="text-foreground">Оформить заказ</b>.</p>
              <p>6. Способ оплаты — <b className="text-foreground">Наличные</b>.</p>
              <p>7. Оформить заказ.</p>
              <p className="pt-2">
                Дальше ждём, когда заказ перейдёт в статус <b className="text-foreground">"Доставлен"</b> — обновляем страницу, ставим <b className="text-foreground">5 звёзд</b>.
              </p>
              <div className="bg-destructive/10 rounded-2xl p-3 space-y-1 mt-3">
                <p className="text-destructive font-bold">❌ Не ставить самовывоз</p>
                <p className="text-destructive font-bold">❌ Не заказывайте много товаров</p>
              </div>
            </div>
            <Button
              onClick={() => setShowInstruction(false)}
              className="w-full mt-6 font-black uppercase bg-foreground text-background hover:bg-foreground/90 h-12 rounded-2xl"
            >
              Понятно
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
