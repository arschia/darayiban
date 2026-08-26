"use client";

import type { Session } from "@supabase/supabase-js";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Bell,
  Bitcoin,
  BookOpen,
  CalendarDays,
  Check,
  ChevronLeft,
  Clipboard,
  Coins,
  Copy,
  CreditCard,
  Download,
  HandCoins,
  Landmark,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  Moon,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Search,
  Share2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Tag,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  WalletCards,
  X,
} from "lucide-react";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { smsEndpoint, supabase } from "../lib/supabase";
import { base64UrlToUint8Array, VAPID_PUBLIC_KEY } from "../lib/push";
import { NotificationView } from "./notification-view";
import {
  Asset,
  AutomationToken,
  BankBalance,
  Budget,
  BudgetTarget,
  NotificationDelivery,
  NotificationPreferences,
  Obligation,
  Profile,
  Transaction,
  ViewId,
  assetNames,
  dateTime,
  localDateKey,
  money,
  numberValue,
  parsePersianDateInput,
  parsePersianDateTimeInput,
  persianDateInput,
  persianDateTimeInput,
  persianMonthRange,
  persianMonthKey,
  rialValue,
  shortDate,
  tomanValue,
} from "./finance-types";

type ModalKind = "transaction" | "obligation" | "asset" | "budget" | "password" | null;

const navItems: Array<{ id: ViewId; label: string; icon: typeof LayoutDashboard }> = [
  { id: "dashboard", label: "خانه", icon: LayoutDashboard },
  { id: "transactions", label: "تراکنش‌ها", icon: ReceiptText },
  { id: "calendar", label: "تقویم مالی", icon: CalendarDays },
  { id: "obligations", label: "بدهی و طلب", icon: HandCoins },
  { id: "assets", label: "دارایی‌ها", icon: Coins },
  { id: "budget", label: "بودجه‌بندی", icon: Target },
  { id: "academy", label: "آموزش", icon: BookOpen },
  { id: "notifications", label: "اعلان‌ها", icon: Bell },
  { id: "install", label: "نصب برنامه", icon: Download },
  { id: "trash", label: "سطل زباله", icon: Trash2 },
];

const transactionCategories = ["خوراک", "رفت‌وآمد", "خرید", "قبوض", "تفریح", "انتقال وجه", "حقوق", "سایر"];

const normalizeTag = (value: string) => value.trim().replace(/^#/, "").replace(/\s+/g, " ");

function parseTags(value: FormDataEntryValue | null) {
  return Array.from(new Set(String(value ?? "").split(/[،,]/).map(normalizeTag).filter(Boolean))).slice(0, 8);
}

function transactionMatchesTag(transaction: Transaction, tag: string) {
  const normalized = normalizeTag(tag).toLocaleLowerCase("fa-IR");
  return (transaction.tags ?? []).some((item) => normalizeTag(item).toLocaleLowerCase("fa-IR") === normalized)
    || normalizeTag(transaction.category ?? "").toLocaleLowerCase("fa-IR") === normalized;
}

function budgetTransactions(budget: Budget, transactions: Transaction[]) {
  const start = new Date(`${budget.period_start}T00:00:00+03:30`).getTime();
  const end = new Date(`${budget.period_end}T23:59:59+03:30`).getTime();
  const withdrawals = transactions.filter((item) => {
    const timestamp = new Date(item.transaction_time).getTime();
    return item.type === "withdrawal" && timestamp >= start && timestamp <= end;
  });
  const explicitTag = normalizeTag(budget.tag ?? "");
  if (explicitTag) return withdrawals.filter((item) => transactionMatchesTag(item, explicitTag));
  const knownTags = Array.from(new Set(withdrawals.flatMap((item) => item.tags ?? []).map(normalizeTag).filter(Boolean)));
  const inferredTags = knownTags.filter((tag) => budget.name.toLocaleLowerCase("fa-IR").includes(tag.toLocaleLowerCase("fa-IR")));
  return inferredTags.length ? withdrawals.filter((item) => inferredTags.some((tag) => transactionMatchesTag(item, tag))) : withdrawals;
}

const assetColors: Record<Asset["asset_type"], string> = {
  gold: "#f3b53f",
  silver: "#93a0b4",
  usd: "#159874",
  eur: "#5368f3",
  usdt: "#28a98b",
  btc: "#f09536",
  toman_cash: "#8a6be8",
};

function BrandMark() {
  return <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>;
}

function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <strong>{title}</strong>
      <p>{text}</p>
      {action}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-label={title}>
        <header><div><span>ثبت اطلاعات</span><h2>{title}</h2></div><button type="button" onClick={onClose} aria-label="بستن"><X size={20} /></button></header>
        {children}
      </section>
    </div>
  );
}

function ViewHeader({ kicker, title, text, action }: { kicker: string; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="view-header">
      <div><span>{kicker}</span><h1>{title}</h1><p>{text}</p></div>
      {action}
    </div>
  );
}

function MiniTrend({ positive, text }: { positive: boolean; text: string }) {
  return <span className={positive ? "mini-trend positive" : "mini-trend negative"}>{positive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}{text}</span>;
}

function DashboardView({
  name,
  transactions,
  obligations,
  assets,
  budgets,
  bankBalances,
  currency,
  openModal,
  openView,
  editTransaction,
  trashTransaction,
  onRefresh,
  refreshing,
  showPasswordNudge,
  openPassword,
}: {
  name: string;
  transactions: Transaction[];
  obligations: Obligation[];
  assets: Asset[];
  budgets: Budget[];
  bankBalances: BankBalance[];
  currency: string;
  openModal: (kind: ModalKind) => void;
  openView: (view: ViewId) => void;
  editTransaction: (transaction: Transaction) => void;
  trashTransaction: (transaction: Transaction) => void;
  onRefresh: () => void;
  refreshing: boolean;
  showPasswordNudge: boolean;
  openPassword: () => void;
}) {
  const now = new Date();
  const monthKey = persianMonthKey(now);
  const monthTransactions = transactions.filter((item) => persianMonthKey(new Date(item.transaction_time)) === monthKey);
  const income = monthTransactions.filter((item) => item.type === "deposit").reduce((sum, item) => sum + numberValue(item.amount), 0);
  const expense = monthTransactions.filter((item) => item.type === "withdrawal").reduce((sum, item) => sum + numberValue(item.amount), 0);
  const assetValue = assets.reduce((sum, item) => sum + numberValue(item.quantity) * numberValue(item.purchase_price), 0);
  const activeBudgets = budgets.filter((item) => new Date(item.period_start) <= now && new Date(`${item.period_end}T23:59:59`) >= now);
  const budgetTotal = activeBudgets.reduce((sum, item) => sum + numberValue(item.amount), 0);
  const budgetSpentTotal = activeBudgets.reduce((sum, item) => sum + budgetTransactions(item, transactions).reduce((spent, transaction) => spent + numberValue(transaction.amount), 0), 0);
  const budgetRemaining = activeBudgets.reduce((sum, item) => {
    const spent = budgetTransactions(item, transactions).reduce((total, transaction) => total + numberValue(transaction.amount), 0);
    return sum + Math.max(0, numberValue(item.amount) - spent);
  }, 0);
  const budgetUsed = budgetTotal ? Math.min(100, Math.round((budgetSpentTotal / budgetTotal) * 100)) : 0;
  const openDebts = obligations.filter((item) => item.kind === "debt" && !["settled", "cancelled"].includes(item.status)).reduce((sum, item) => sum + numberValue(item.remaining_amount), 0);

  const assetGroups = assets.reduce<Record<string, number>>((result, item) => {
    result[item.asset_type] = (result[item.asset_type] ?? 0) + numberValue(item.quantity) * numberValue(item.purchase_price);
    return result;
  }, {});
  const allocation = Object.entries(assetGroups).map(([key, value]) => ({ key: key as Asset["asset_type"], value, percent: assetValue ? Math.round((value / assetValue) * 100) : 0 })).sort((a, b) => b.value - a.value);
  const donutStops = allocation.reduce<{ offset: number; stops: string[] }>((result, item) => {
    const nextOffset = result.offset + item.percent;
    return { offset: nextOffset, stops: [...result.stops, `${assetColors[item.key]} ${result.offset}% ${nextOffset}%`] };
  }, { offset: 0, stops: [] }).stops;

  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    const list = transactions.filter((item) => {
      const itemDate = new Date(item.transaction_time);
      return itemDate.getFullYear() === date.getFullYear() && itemDate.getMonth() === date.getMonth();
    });
    return {
      label: new Intl.DateTimeFormat("fa-IR-u-ca-persian", { month: "short" }).format(date),
      income: list.filter((item) => item.type === "deposit").reduce((sum, item) => sum + numberValue(item.amount), 0),
      expense: list.filter((item) => item.type === "withdrawal").reduce((sum, item) => sum + numberValue(item.amount), 0),
    };
  });
  const chartMax = Math.max(1, ...months.flatMap((item) => [item.income, item.expense]));

  return (
    <div className="dashboard-view">
      <section className="welcome-row">
        <div>
          <p className="eyebrow">{new Intl.DateTimeFormat("fa-IR-u-ca-persian", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now)}</p>
          <h1>سلام {name}، اوضاع مالی چطوره؟</h1>
          <p className="muted">همه حساب‌ها و دارایی‌هایت یک‌جا و مرتب‌اند.</p>
        </div>
        <div className="dashboard-actions">
          <button className="primary-button dashboard-add-button" onClick={() => openModal("transaction")} type="button" aria-label="ثبت تراکنش"><Plus size={20} /><span>ثبت تراکنش</span></button>
          <button className="dashboard-refresh-button" disabled={refreshing} onClick={onRefresh} type="button" aria-label="تازه‌سازی اطلاعات"><RefreshCw className={refreshing ? "spin" : ""} size={19} /><span>{refreshing ? "در حال تازه‌سازی" : "تازه‌سازی"}</span></button>
        </div>
      </section>

      {showPasswordNudge && <section className="password-nudge panel"><div className="password-nudge-icon"><LockKeyhole size={20} /></div><div><strong>ورود بعدی با ایمیل و رمز</strong><p>برای همین حساب گوگل یک رمز بساز تا دفعه بعد بدون رفتن به صفحه گوگل وارد شوی.</p></div><button onClick={openPassword} type="button">ساخت رمز ورود</button></section>}

      <section className="summary-grid" aria-label="خلاصه مالی">
        <article className="summary-card balance-card"><div className="summary-top"><span className="icon-tile blue"><WalletCards size={22} /></span><MiniTrend positive={assetValue >= 0} text={assets.length ? `${assets.length.toLocaleString("fa-IR")} دارایی` : "شروع کن"} /></div><span className="summary-label">ارزش ثبت‌شده دارایی</span><strong>{money(assetValue)}</strong><small>{currency}</small></article>
        <article className="summary-card"><div className="summary-top"><span className="icon-tile green"><ArrowDownLeft size={22} /></span><MiniTrend positive text={`${monthTransactions.filter((item) => item.type === "deposit").length.toLocaleString("fa-IR")} واریز`} /></div><span className="summary-label">درآمد این ماه</span><strong>{money(income)}</strong><small>{currency}</small></article>
        <article className="summary-card"><div className="summary-top"><span className="icon-tile coral"><ArrowUpRight size={22} /></span><MiniTrend positive={false} text={`${monthTransactions.filter((item) => item.type === "withdrawal").length.toLocaleString("fa-IR")} برداشت`} /></div><span className="summary-label">هزینه این ماه</span><strong>{money(expense)}</strong><small>{currency}</small></article>
        <article className="summary-card budget-card"><div className="summary-top"><span className="icon-tile violet"><Target size={22} /></span><span className="pill">{budgetTotal ? `${budgetUsed.toLocaleString("fa-IR")}٪ مصرف` : "بودجه‌ای نیست"}</span></div><span className="summary-label">بودجه باقی‌مانده</span><strong>{money(budgetRemaining)}</strong><div className="progress"><span style={{ width: `${budgetUsed}%` }} /></div><small>{budgetTotal ? `از ${money(budgetTotal)} ${currency}` : "اولین بودجه را ثبت کن"}</small></article>
      </section>

      {bankBalances.length ? (
        <section className="bank-balances-section" aria-label="موجودی حساب‌های بانکی">
          <div className="bank-balances-heading"><div><Landmark size={20} /><div><h2>موجودی حساب‌های بانکی</h2><p>آخرین مانده اعلام‌شده در پیامک هر بانک</p></div></div><span>{bankBalances.length.toLocaleString("fa-IR")} حساب</span></div>
          <div className="bank-balances-grid">
            {bankBalances.map((item) => (
              <article className="bank-balance-card panel" key={item.id}>
                <div className="bank-balance-top"><span><Landmark size={21} /></span><time>{dateTime(item.reported_at)}</time></div>
                <p>موجودی بانک {item.bank_name}</p>
                <strong>{money(tomanValue(item.balance, item.currency))} <small>{currency}</small></strong>
                {item.account_hint ? <em>حساب {item.account_hint}</em> : <em>حساب بانکی</em>}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="content-grid">
        <article className="panel cashflow-panel">
          <div className="panel-heading"><div><h2>جریان درآمد و هزینه</h2><p>شش ماه گذشته</p></div><div className="legend"><span><i className="income-dot" /> درآمد</span><span><i className="expense-dot" /> هزینه</span></div></div>
          <div className="bar-chart" aria-label="نمودار جریان درآمد و هزینه">
            {months.map((month) => <div className="bar-month" key={`${month.label}-${month.income}-${month.expense}`}><div className="bar-pair"><i className="income-bar" style={{ height: `${Math.max(4, (month.income / chartMax) * 100)}%` }} title={`درآمد ${money(month.income)}`} /><i className="expense-bar" style={{ height: `${Math.max(4, (month.expense / chartMax) * 100)}%` }} title={`هزینه ${money(month.expense)}`} /></div><span>{month.label}</span></div>)}
          </div>
        </article>

        <article className="panel allocation-panel">
          <div className="panel-heading"><div><h2>ترکیب دارایی</h2><p>بر پایه ارزش ثبت‌شده</p></div><button className="icon-button" onClick={() => openView("assets")} aria-label="دیدن جزئیات"><ArrowLeft size={18} /></button></div>
          {allocation.length ? <div className="allocation-body"><div className="donut dynamic-donut" style={{ background: `conic-gradient(${donutStops.join(",")})` }}><div><strong>{money(assetValue)}</strong><small>{currency}</small></div></div><div className="allocation-list">{allocation.slice(0, 6).map((item) => <div className="allocation-item" key={item.key}><div><i style={{ background: assetColors[item.key] }} /><span>{assetNames[item.key]}</span></div><strong>{item.percent.toLocaleString("fa-IR")}٪</strong></div>)}</div></div> : <EmptyState icon={<Coins size={24} />} title="هنوز دارایی ثبت نشده" text="طلا، ارز یا رمزارزهایت را اضافه کن." action={<button className="text-button" onClick={() => openModal("asset")} type="button">افزودن دارایی <ChevronLeft size={17} /></button>} />}
        </article>

        <article className="panel transactions-panel">
          <div className="panel-heading"><div><h2>تراکنش‌های اخیر</h2><p>آخرین فعالیت‌های ثبت‌شده</p></div><button className="text-button" onClick={() => openView("transactions")} type="button">مشاهده همه <ChevronLeft size={17} /></button></div>
          {transactions.length ? <div className="transactions-list">{transactions.slice(0, 5).map((item) => <TransactionRow key={item.id} item={item} currency={currency} onEdit={editTransaction} onTrash={trashTransaction} />)}</div> : <EmptyState icon={<ReceiptText size={24} />} title="هنوز تراکنشی نداری" text="دستی ثبت کن یا اتومیشن آیفون را وصل کن." action={<button className="text-button" onClick={() => openModal("transaction")} type="button">ثبت اولین تراکنش <ChevronLeft size={17} /></button>} />}
        </article>

        <article className="panel smart-panel"><div className="smart-icon"><Sparkles size={22} /></div><div><span className="smart-label">جمع‌بندی امروز</span><h2>{openDebts ? `${money(openDebts)} ${currency} بدهی باز داری` : "هیچ بدهی سررسیدنشده‌ای ثبت نشده"}</h2><p>{transactions.length ? `تا این لحظه ${transactions.length.toLocaleString("fa-IR")} تراکنش در حساب تو ثبت شده است.` : "با ثبت چند تراکنش، بینش‌های دقیق‌تری اینجا می‌بینی."}</p></div><button className="secondary-button" onClick={() => openView("obligations")} type="button">دیدن بدهی‌ها</button></article>
      </section>
    </div>
  );
}

function TransactionRow({
  item,
  currency,
  onEdit,
  onTrash,
  onRestore,
  onDelete,
}: {
  item: Transaction;
  currency: string;
  onEdit?: (transaction: Transaction) => void;
  onTrash?: (transaction: Transaction) => void;
  onRestore?: (transaction: Transaction) => void;
  onDelete?: (transaction: Transaction) => void;
}) {
  const income = item.type === "deposit";
  return (
    <div className="transaction-row">
      <div className={`transaction-icon ${income ? "income" : "expense"}`}>{income ? <ArrowDownLeft size={19} /> : <CreditCard size={19} />}</div>
      <div className="transaction-copy"><strong>{item.description || (income ? "واریز" : "برداشت")}</strong><span>{[item.bank_name, item.category, item.from_card].filter(Boolean).join(" • ") || "ثبت دستی"}</span>{item.tags?.length ? <div className="transaction-tags">{item.tags.map((tag) => <em key={tag}>#{tag}</em>)}</div> : null}</div>
      <time>{dateTime(item.transaction_time)}</time>
      <div className={`transaction-amount ${income ? "income" : "expense"}`}><strong>{income ? "+" : "−"}{money(item.amount)}</strong><span>{currency}</span></div>
      {(onEdit || onTrash || onRestore || onDelete) && <div className="transaction-actions">{onEdit && <button type="button" onClick={() => onEdit(item)} aria-label="ویرایش تراکنش" title="ویرایش"><Pencil size={16} /></button>}{onTrash && <button className="danger" type="button" onClick={() => onTrash(item)} aria-label="انتقال به سطل زباله" title="انتقال به سطل زباله"><Trash2 size={16} /></button>}{onRestore && <button className="restore" type="button" onClick={() => onRestore(item)} aria-label="بازیابی تراکنش" title="بازیابی"><RotateCcw size={16} /></button>}{onDelete && <button className="danger" type="button" onClick={() => onDelete(item)} aria-label="حذف دائمی تراکنش" title="حذف دائمی"><Trash2 size={16} /></button>}</div>}
    </div>
  );
}

function TransactionsView({ transactions, currency, search, setSearch, openModal, onEdit, onTrash, trashCount, openTrash }: { transactions: Transaction[]; currency: string; search: string; setSearch: (value: string) => void; openModal: () => void; onEdit: (transaction: Transaction) => void; onTrash: (transaction: Transaction) => void; trashCount: number; openTrash: () => void }) {
  const filtered = transactions.filter((item) => [item.description, item.category, item.bank_name, item.from_card, item.to_card, ...(item.tags ?? [])].filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase()));
  return (
    <section className="data-view">
      <ViewHeader kicker="گزارش حساب" title="تراکنش‌ها" text="برداشت‌ها و واریزهای دستی یا ثبت‌شده با اتومیشن." action={<button className="primary-button" onClick={openModal} type="button"><Plus size={19} /> تراکنش جدید</button>} />
      <div className="toolbar"><label className="inline-search"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="جست‌وجوی عنوان، تگ، کارت یا بانک..." /></label><button className="trash-shortcut" onClick={openTrash} type="button"><Trash2 size={17} /> سطل زباله{trashCount ? <span>{trashCount.toLocaleString("fa-IR")}</span> : null}</button><div className="toolbar-count">{filtered.length.toLocaleString("fa-IR")} مورد</div></div>
      <article className="panel data-panel">
        {filtered.length ? <div className="transactions-list full-list">{filtered.map((item) => <TransactionRow key={item.id} item={item} currency={currency} onEdit={onEdit} onTrash={onTrash} />)}</div> : <EmptyState icon={<Search size={24} />} title={search ? "چیزی پیدا نشد" : "لیست تراکنش‌ها خالی است"} text={search ? "عبارت دیگری جست‌وجو کن." : "اولین برداشت یا واریزت را ثبت کن."} action={!search ? <button className="primary-button small" onClick={openModal} type="button"><Plus size={17} /> ثبت تراکنش</button> : undefined} />}
      </article>
    </section>
  );
}

function TrashView({ transactions, currency, onRestore, onDelete }: { transactions: Transaction[]; currency: string; onRestore: (transaction: Transaction) => void; onDelete: (transaction: Transaction) => void }) {
  return (
    <section className="data-view">
      <ViewHeader kicker="قابل بازیابی" title="سطل زباله" text="تراکنش‌های حذف‌شده در گزارش‌ها و بودجه حساب نمی‌شوند و تا حذف دائمی قابل بازیابی‌اند." />
      <article className="panel data-panel trash-panel">
        {transactions.length ? <div className="transactions-list full-list">{transactions.map((item) => <TransactionRow key={item.id} item={item} currency={currency} onRestore={onRestore} onDelete={onDelete} />)}</div> : <EmptyState icon={<Trash2 size={25} />} title="سطل زباله خالی است" text="تراکنشی برای بازیابی یا حذف دائمی وجود ندارد." />}
      </article>
    </section>
  );
}

function persianDayNumber(date: Date) {
  const value = new Intl.DateTimeFormat("en-u-ca-persian", { day: "numeric" }).format(date);
  return Number(value);
}

function buildCalendar() {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  for (let index = 0; index < 35 && persianDayNumber(start) !== 1; index++) start.setDate(start.getDate() - 1);
  const blankCount = (start.getDay() + 1) % 7;
  const days: Array<Date | null> = Array.from({ length: blankCount }, () => null);
  for (let index = 0; index < 32; index++) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    if (index > 0 && persianDayNumber(date) === 1) break;
    days.push(date);
  }
  while (days.length % 7) days.push(null);
  return days;
}

function CalendarView({ transactions, obligations, currency, onEdit, onTrash }: { transactions: Transaction[]; obligations: Obligation[]; currency: string; onEdit: (transaction: Transaction) => void; onTrash: (transaction: Transaction) => void }) {
  const days = useMemo(() => buildCalendar(), []);
  const todayKey = localDateKey(new Date());
  const [selected, setSelected] = useState(todayKey);
  const transactionsByDay = useMemo(() => transactions.reduce<Record<string, Transaction[]>>((result, item) => { const key = localDateKey(new Date(item.transaction_time)); (result[key] ??= []).push(item); return result; }, {}), [transactions]);
  const selectedTransactions = transactionsByDay[selected] ?? [];
  const selectedObligations = obligations.filter((item) => item.due_date === selected);
  const selectedDate = new Date(`${selected}T12:00:00`);
  return (
    <section className="data-view">
      <ViewHeader kicker="نمای ماهانه" title="تقویم مالی" text="روی هر روز بزن تا تراکنش‌ها و سررسیدهای همان روز را ببینی." />
      <div className="calendar-layout">
        <article className="panel calendar-panel">
          <div className="calendar-title"><div><CalendarDays size={21} /><strong>{new Intl.DateTimeFormat("fa-IR-u-ca-persian", { month: "long", year: "numeric" }).format(days.find(Boolean) as Date)}</strong></div><span>امروز: {shortDate(new Date())}</span></div>
          <div className="weekday-row">{["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="calendar-grid">{days.map((date, index) => date ? <button key={localDateKey(date)} className={[localDateKey(date) === selected ? "selected" : "", localDateKey(date) === todayKey ? "today" : "", transactionsByDay[localDateKey(date)]?.length ? "has-data" : ""].join(" ")} onClick={() => setSelected(localDateKey(date))} type="button"><strong>{persianDayNumber(date).toLocaleString("fa-IR")}</strong>{transactionsByDay[localDateKey(date)]?.length ? <span>{transactionsByDay[localDateKey(date)].length.toLocaleString("fa-IR")}</span> : null}{obligations.some((item) => item.due_date === localDateKey(date)) && <i />}</button> : <div className="blank-day" key={`blank-${index}`} />)}</div>
        </article>
        <article className="panel day-report">
          <div className="day-report-head"><span>گزارش روز</span><h2>{shortDate(selectedDate)}</h2></div>
          <div className="day-mini-stats"><div><span>واریز</span><strong>{money(selectedTransactions.filter((item) => item.type === "deposit").reduce((sum, item) => sum + numberValue(item.amount), 0))}</strong></div><div><span>برداشت</span><strong>{money(selectedTransactions.filter((item) => item.type === "withdrawal").reduce((sum, item) => sum + numberValue(item.amount), 0))}</strong></div></div>
          <div className="day-items">{selectedTransactions.map((item) => <TransactionRow key={item.id} item={item} currency={currency} onEdit={onEdit} onTrash={onTrash} />)}{selectedObligations.map((item) => <div className="due-item" key={item.id}><HandCoins size={18} /><div><strong>{item.title}</strong><span>{item.kind === "debt" ? "بدهی سررسیدشده" : "طلب سررسیدشده"}</span></div><b>{money(item.remaining_amount)}</b></div>)}</div>
          {!selectedTransactions.length && !selectedObligations.length && <EmptyState icon={<CalendarDays size={23} />} title="این روز گزارشی ندارد" text="تراکنش یا سررسیدی برای این تاریخ ثبت نشده." />}
        </article>
      </div>
    </section>
  );
}

function ObligationsView({ obligations, currency, openModal }: { obligations: Obligation[]; currency: string; openModal: () => void }) {
  const active = obligations.filter((item) => !["settled", "cancelled"].includes(item.status));
  const debts = active.filter((item) => item.kind === "debt");
  const receivables = active.filter((item) => item.kind === "receivable");
  return (
    <section className="data-view">
      <ViewHeader kicker="تعهدهای مالی" title="بدهی‌ها و طلب‌ها" text="مبلغ باقی‌مانده و تاریخ سررسید هر تعهد را دنبال کن." action={<button className="primary-button" onClick={openModal} type="button"><Plus size={19} /> مورد جدید</button>} />
      <div className="obligation-summary"><article><span className="icon-tile coral"><ArrowUpRight size={21} /></span><div><span>مجموع بدهی باز</span><strong>{money(debts.reduce((sum, item) => sum + numberValue(item.remaining_amount), 0))} <small>{currency}</small></strong></div></article><article><span className="icon-tile green"><ArrowDownLeft size={21} /></span><div><span>مجموع طلب باز</span><strong>{money(receivables.reduce((sum, item) => sum + numberValue(item.remaining_amount), 0))} <small>{currency}</small></strong></div></article></div>
      <div className="two-column-view"><ObligationColumn title="بدهی‌های من" items={debts} kind="debt" currency={currency} /><ObligationColumn title="طلب‌های من" items={receivables} kind="receivable" currency={currency} /></div>
    </section>
  );
}

function ObligationColumn({ title, items, kind, currency }: { title: string; items: Obligation[]; kind: "debt" | "receivable"; currency: string }) {
  return <article className="panel obligation-column"><div className="column-head"><h2>{title}</h2><span>{items.length.toLocaleString("fa-IR")} مورد</span></div>{items.length ? <div className="obligation-list">{items.map((item) => <div className="obligation-item" key={item.id}><div className={`obligation-badge ${kind}`}><HandCoins size={19} /></div><div><strong>{item.title}</strong><span>{item.counterparty || "بدون نام"}{item.due_date ? ` • سررسید ${shortDate(item.due_date)}` : ""}</span><div className="thin-progress"><i style={{ width: `${Math.max(4, Math.round((numberValue(item.remaining_amount) / Math.max(1, numberValue(item.original_amount))) * 100))}%` }} /></div></div><b>{money(item.remaining_amount)}<small>{currency}</small></b></div>)}</div> : <EmptyState icon={<HandCoins size={23} />} title={kind === "debt" ? "بدهی بازی نداری" : "طلب بازی نداری"} text="موارد جدید بعد از ثبت اینجا دیده می‌شوند." />}</article>;
}

function AssetsView({ assets, targets, currency, openModal }: { assets: Asset[]; targets: BudgetTarget[]; currency: string; openModal: () => void }) {
  const total = assets.reduce((sum, item) => sum + numberValue(item.quantity) * numberValue(item.purchase_price), 0);
  return (
    <section className="data-view">
      <ViewHeader kicker="سبد سرمایه" title="دارایی‌ها" text="طلا، نقره، ارز و رمزارزهایت را کنار هم ببین." action={<button className="primary-button" onClick={openModal} type="button"><Plus size={19} /> افزودن دارایی</button>} />
      <div className="asset-hero"><div><span>ارزش ثبت‌شده سبد</span><strong>{money(total)} <small>{currency}</small></strong><p>قیمت‌های خرید یا برآورد دستی فعلی</p></div><div className="asset-orbit"><Coins size={34} /><Bitcoin size={25} /><Landmark size={24} /></div></div>
      <div className="asset-grid">{assets.map((item) => { const value = numberValue(item.quantity) * numberValue(item.purchase_price); const target = targets.find((targetItem) => targetItem.asset_type === item.asset_type); return <article className="panel asset-card" key={item.id}><div className="asset-card-top"><span style={{ background: `${assetColors[item.asset_type]}1a`, color: assetColors[item.asset_type] }}>{item.asset_type === "btc" ? <Bitcoin size={22} /> : <Coins size={22} />}</span><em>{target ? `هدف ${money(target.target_percentage)}٪` : "بدون هدف"}</em></div><h2>{assetNames[item.asset_type]}</h2><strong>{money(item.quantity)} <small>واحد</small></strong><div className="asset-value"><span>ارزش ثبت‌شده</span><b>{money(value)} {currency}</b></div>{item.purchase_date && <p>ثبت در {shortDate(item.purchase_date)}</p>}</article>; })}{!assets.length && <article className="panel asset-empty"><EmptyState icon={<Coins size={25} />} title="سبد دارایی خالی است" text="اولین دارایی مثل طلا، دلار یا بیت‌کوین را اضافه کن." action={<button className="primary-button small" onClick={openModal} type="button"><Plus size={17} /> افزودن دارایی</button>} /></article>}</div>
      <div className="price-notice"><ShieldCheck size={20} /><div><strong>قیمت لحظه‌ای هنوز متصل نشده</strong><p>برای طلای ایران، ارز آزاد و نقره باید منبع قیمت قابل‌اعتماد انتخاب شود. تا آن زمان ارزش هر دارایی را دستی وارد می‌کنی.</p></div></div>
    </section>
  );
}

function BudgetView({ budgets, targets, transactions, currency, openModal, onDelete }: { budgets: Budget[]; targets: BudgetTarget[]; transactions: Transaction[]; currency: string; openModal: () => void; onDelete: (budget: Budget) => void }) {
  return (
    <section className="data-view">
      <ViewHeader kicker="برنامه مالی" title="بودجه‌بندی" text="برای هزینه‌های ماه و ترکیب دارایی‌ها هدف مشخص کن." action={<button className="primary-button" onClick={openModal} type="button"><Plus size={19} /> بودجه جدید</button>} />
      <div className="budget-layout">
        <article className="panel budget-list-panel"><div className="column-head"><h2>بودجه‌ها</h2><span>{budgets.length.toLocaleString("fa-IR")} بودجه</span></div>{budgets.length ? <div className="budget-list">{budgets.map((item) => { const matched = budgetTransactions(item, transactions); const spent = matched.reduce((sum, transaction) => sum + numberValue(transaction.amount), 0); const used = Math.min(100, Math.round((spent / Math.max(1, numberValue(item.amount))) * 100)); const inferredTag = !item.tag ? Array.from(new Set(transactions.flatMap((transaction) => transaction.tags ?? []))).find((tag) => item.name.toLocaleLowerCase("fa-IR").includes(tag.toLocaleLowerCase("fa-IR"))) : null; const scope = item.tag || inferredTag; return <div className="budget-row" key={item.id}><div className="budget-row-head"><div><strong>{item.name}</strong><span>{shortDate(item.period_start)} تا {shortDate(item.period_end)}</span>{scope ? <em><Tag size={11} /> فقط #{scope}</em> : <em>همه هزینه‌های این بازه</em>}</div><div className="budget-row-actions"><b>{used.toLocaleString("fa-IR")}٪</b><button type="button" onClick={() => onDelete(item)} aria-label={`حذف بودجه ${item.name}`}><Trash2 size={14} /> حذف</button></div></div><div className="budget-track"><i style={{ width: `${used}%` }} /></div><div className="budget-foot"><span>{money(spent)} {currency} مصرف</span><span>{money(Math.max(0, numberValue(item.amount) - spent))} {currency} باقی‌مانده</span></div></div>; })}</div> : <EmptyState icon={<Target size={23} />} title="هنوز بودجه‌ای تعریف نکردی" text="یک سقف هزینه ماهانه بساز و روند مصرفش را ببین." action={<button className="primary-button small" onClick={openModal} type="button"><Plus size={17} /> ساخت بودجه</button>} />}</article>
        <article className="panel targets-panel"><div className="column-head"><h2>هدف ترکیب دارایی</h2><span>مجموع {money(targets.reduce((sum, item) => sum + numberValue(item.target_percentage), 0))}٪</span></div>{targets.length ? <div className="target-list">{targets.map((item) => <div key={item.id}><span>{assetNames[item.asset_type as Asset["asset_type"]] ?? item.asset_type}</span><div><i style={{ width: `${numberValue(item.target_percentage)}%` }} /></div><strong>{money(item.target_percentage)}٪</strong></div>)}</div> : <EmptyState icon={<Coins size={23} />} title="هدفی برای سبد ثبت نشده" text="بعداً می‌توانی درصد مطلوب طلا، ارز و رمزارز را مشخص کنی." />}</article>
      </div>
      <div className="budget-tip"><Sparkles size={20} /><div><strong>پیشنهاد ساده برای شروع</strong><p>اول هزینه ثابت ماهانه و مبلغ پس‌انداز را جدا کن. بعد برای هر گروه دارایی درصد هدف بگذار؛ این بخش توصیه سرمایه‌گذاری نیست.</p></div></div>
    </section>
  );
}

function AcademyView({ tokens, userId, refreshTokens }: { tokens: AutomationToken[]; userId: string; refreshTokens: () => Promise<void> }) {
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(value: string, key: string) {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1500);
  }

  async function generateToken() {
    setBusy(true);
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const token = `db_${Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const tokenHash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const { error } = await supabase.from("automation_tokens").insert({ user_id: userId, label: "iPhone Shortcut", token_hash: tokenHash });
    if (!error) {
      setRawToken(token);
      await refreshTokens();
    }
    setBusy(false);
  }

  return (
    <section className="data-view academy-view">
      <ViewHeader kicker="راهنمای شروع" title="آموزش و اتومیشن آیفون" text="پیامک بانکی را با Shortcuts به endpoint امن خودت بفرست." />
      <div className="academy-grid">
        <article className="panel lesson-card"><span>۱</span><div><h2>توکن اختصاصی بساز</h2><p>این توکن مثل کلید ورود اتومیشن است. فقط هش آن در دیتابیس ذخیره می‌شود.</p>{rawToken ? <div className="secret-box"><div><small>فقط همین یک‌بار نمایش داده می‌شود</small><code dir="ltr">{rawToken}</code></div><button onClick={() => copy(rawToken, "token")} type="button">{copied === "token" ? <Check size={17} /> : <Copy size={17} />}</button></div> : <button className="primary-button small" onClick={generateToken} disabled={busy} type="button"><ShieldCheck size={17} />{busy ? "در حال ساخت..." : "ساخت توکن جدید"}</button>}<div className="token-count">{tokens.filter((item) => !item.revoked_at).length.toLocaleString("fa-IR")} توکن فعال</div></div></article>
        <article className="panel lesson-card"><span>۲</span><div><h2>آدرس endpoint را کپی کن</h2><p>در اکشن Get Contents of URL این آدرس را با متد POST قرار بده.</p><div className="endpoint-box"><code dir="ltr">{smsEndpoint}</code><button onClick={() => copy(smsEndpoint, "endpoint")} type="button">{copied === "endpoint" ? <Check size={17} /> : <Copy size={17} />}</button></div></div></article>
        <article className="panel lesson-card"><span>۳</span><div><h2>هدر و بدنه درخواست</h2><p>هدر <code dir="ltr">x-selfmali-token</code> را برابر توکن بگذار و متن پیامک را با قالب زیر بفرست.</p><pre dir="ltr">{`{
  "message": "متن پیامک بانکی",
  "device_time": "زمان فعلی",
  "bank_name": "سامان"
}`}</pre></div></article>
        <article className="panel lesson-card"><span>۴</span><div><h2>فایل Shortcut نهایی</h2><p>بعد از اینکه فایل اتومیشن خودت را بفرستی، آن را با این endpoint هماهنگ می‌کنم و دکمه نصب مستقیم را همین‌جا می‌گذارم.</p><div className="waiting-chip"><Clipboard size={17} /> منتظر فایل اتومیشن تو</div></div></article>
      </div>
      <article className="panel automation-status"><div><Sparkles size={22} /><div><strong>endpoint فعال و تست شده</strong><p>پیامک آزمایشی بانک سامان با موفقیت به تراکنش برداشت تبدیل شد و داده آزمایشی هم پاک شد.</p></div></div><span>نسخه ۳</span></article>
    </section>
  );
}

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type InstallPromptWindow = Window & {
  __darayibanInstallPrompt?: InstallPromptEvent;
};

function InstallView() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop">("desktop");
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const installWindow = window as InstallPromptWindow;
    const syncInstallPrompt = () => {
      setPromptEvent(installWindow.__darayibanInstallPrompt ?? null);
    };
    const frame = window.requestAnimationFrame(() => {
      const userAgent = navigator.userAgent.toLowerCase();
      setPlatform(/iphone|ipad|ipod/.test(userAgent) ? "ios" : /android/.test(userAgent) ? "android" : "desktop");
      setInstalled(window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
      syncInstallPrompt();
    });
    const onInstalled = () => {
      delete installWindow.__darayibanInstallPrompt;
      setInstalled(true);
      setPromptEvent(null);
    };
    window.addEventListener("darayiban-install-ready", syncInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("darayiban-install-ready", syncInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === "accepted") {
      delete (window as InstallPromptWindow).__darayibanInstallPrompt;
      setPromptEvent(null);
    }
  }

  return (
    <section className="data-view install-view">
      <ViewHeader kicker="نسخه قابل نصب" title="نصب دارایی‌بان" text="دارایی‌بان را مثل یک برنامه واقعی روی صفحه اصلی گوشی یا دسکتاپ داشته باش." />
      <div className="install-hero panel">
        <div className="install-app-icon"><BrandMark /></div>
        <div><span>{installed ? "نصب شده" : "آماده نصب"}</span><h2>دارایی‌بان</h2><p>اجرای تمام‌صفحه، دسترسی سریع و ظاهر هماهنگ با گوشی</p></div>
        {installed ? <div className="installed-badge"><Check size={18} /> روی دستگاه نصب است</div> : promptEvent ? <button className="primary-button install-button" onClick={() => void install()} type="button"><Download size={19} /> نصب برنامه</button> : null}
      </div>
      <div className="install-grid">
        <article className={platform === "ios" ? "panel install-guide recommended" : "panel install-guide"}><div className="install-guide-head"><span><Smartphone size={23} /></span><div><h2>آیفون و آیپد</h2><p>نصب از مرورگر Safari</p></div>{platform === "ios" && <em>دستگاه شما</em>}</div><ol><li>همین صفحه را در <strong>Safari</strong> باز کن.</li><li>پایین صفحه روی دکمه <Share2 size={15} /> <strong>Share</strong> بزن.</li><li>گزینه <strong>Add to Home Screen</strong> را انتخاب کن.</li><li>بالا روی <strong>Add</strong> بزن تا آیکن برنامه اضافه شود.</li></ol></article>
        <article className={platform === "android" ? "panel install-guide recommended" : "panel install-guide"}><div className="install-guide-head"><span><Download size={23} /></span><div><h2>اندروید</h2><p>نصب از مرورگر Chrome</p></div>{platform === "android" && <em>دستگاه شما</em>}</div><ol><li>صفحه را در <strong>Chrome</strong> باز کن.</li><li>از منوی سه‌نقطه، <strong>Install app</strong> یا <strong>Add to Home screen</strong> را بزن.</li><li>پیام نصب را تأیید کن.</li></ol>{promptEvent && !installed ? <button className="primary-button install-button inline" onClick={() => void install()} type="button"><Download size={18} /> نصب مستقیم</button> : null}</article>
      </div>
      <div className="install-note"><ShieldCheck size={20} /><div><strong>حساب و اطلاعاتت همان حساب فعلی باقی می‌ماند</strong><p>نسخه نصب‌شده به همان اطلاعات امن سایت وصل است و برای استفاده دوباره نیازی به ساخت حساب جداگانه نداری.</p></div></div>
    </section>
  );
}

export function FinanceApp({ session }: { session: Session }) {
  const [activeView, setActiveView] = useState<ViewId>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [trashTransactions, setTrashTransactions] = useState<Transaction[]>([]);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [targets, setTargets] = useState<BudgetTarget[]>([]);
  const [tokens, setTokens] = useState<AutomationToken[]>([]);
  const [bankBalances, setBankBalances] = useState<BankBalance[]>([]);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences | null>(null);
  const [notificationDeliveries, setNotificationDeliveries] = useState<NotificationDelivery[]>([]);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | "unsupported">("default");
  const userId = session.user.id;
  const providers = Array.isArray(session.user.app_metadata?.providers) ? session.user.app_metadata.providers as string[] : [];
  const googleOnlyAccount = providers.includes("google") && !providers.includes("email");
  const [passwordReady, setPasswordReady] = useState(!googleOnlyAccount);

  const loadData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    const [profileResult, transactionsResult, trashResult, obligationsResult, assetsResult, budgetsResult, targetsResult, tokensResult, balancesResult, notificationPreferencesResult, notificationDeliveriesResult] = await Promise.all([
      supabase.from("profiles").select("id,full_name,base_currency,locale,timezone").eq("id", userId).maybeSingle(),
      supabase.from("transactions").select("id,type,amount,description,from_card,to_card,transaction_time,category,tags,bank_name,source,currency,deleted_at,updated_at").eq("user_id", userId).is("deleted_at", null).order("transaction_time", { ascending: false }).limit(250),
      supabase.from("transactions").select("id,type,amount,description,from_card,to_card,transaction_time,category,tags,bank_name,source,currency,deleted_at,updated_at").eq("user_id", userId).not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(100),
      supabase.from("obligations").select("id,kind,title,counterparty,original_amount,remaining_amount,currency,due_date,status,notes").eq("user_id", userId).order("due_date", { ascending: true, nullsFirst: false }),
      supabase.from("assets").select("id,asset_type,quantity,purchase_price,purchase_date,notes").eq("user_id", userId).order("created_at", { ascending: false }),
      supabase.from("budgets").select("id,name,amount,currency,period_start,period_end,tag,notes").eq("user_id", userId).order("period_start", { ascending: false }),
      supabase.from("budget_targets").select("id,asset_type,target_percentage").eq("user_id", userId),
      supabase.from("automation_tokens").select("id,label,last_used_at,revoked_at,created_at").eq("user_id", userId).order("created_at", { ascending: false }),
      supabase.from("bank_balances").select("id,bank_name,account_hint,balance,currency,reported_at,updated_at").eq("user_id", userId).order("updated_at", { ascending: false }),
      supabase.from("notification_preferences").select("user_id,daily_limit,daily_limit_enabled,daily_summary_enabled,daily_summary_time,timezone").eq("user_id", userId).maybeSingle(),
      supabase.from("notification_deliveries").select("id,kind,title,body,status,sent_at,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
    ]);
    const error = [profileResult.error, transactionsResult.error, trashResult.error, obligationsResult.error, assetsResult.error, budgetsResult.error, targetsResult.error, tokensResult.error, balancesResult.error, notificationPreferencesResult.error, notificationDeliveriesResult.error].find(Boolean);
    if (error) setNotice("بخشی از اطلاعات بارگذاری نشد. دوباره تلاش کن.");
    setProfile(profileResult.data as Profile | null);
    const baseCurrency = profileResult.data?.base_currency ?? "IRR";
    setTransactions(((transactionsResult.data ?? []) as Transaction[]).map((item) => ({ ...item, amount: tomanValue(item.amount, item.currency ?? baseCurrency), currency: "IRT" })));
    setTrashTransactions(((trashResult.data ?? []) as Transaction[]).map((item) => ({ ...item, amount: tomanValue(item.amount, item.currency ?? baseCurrency), currency: "IRT" })));
    setObligations(((obligationsResult.data ?? []) as Obligation[]).map((item) => ({ ...item, original_amount: tomanValue(item.original_amount, item.currency), remaining_amount: tomanValue(item.remaining_amount, item.currency), currency: "IRT" })));
    setAssets(((assetsResult.data ?? []) as Asset[]).map((item) => ({ ...item, purchase_price: tomanValue(item.purchase_price, baseCurrency) })));
    setBudgets(((budgetsResult.data ?? []) as Budget[]).map((item) => ({ ...item, amount: tomanValue(item.amount, item.currency), currency: "IRT" })));
    setTargets((targetsResult.data ?? []) as BudgetTarget[]);
    setTokens((tokensResult.data ?? []) as AutomationToken[]);
    setBankBalances(((balancesResult.data ?? []) as BankBalance[]).map((item) => ({ ...item, balance: tomanValue(item.balance, item.currency), currency: "IRT" })));
    const rawPreferences = notificationPreferencesResult.data as NotificationPreferences | null;
    setNotificationPreferences(rawPreferences ? { ...rawPreferences, daily_limit: rawPreferences.daily_limit ? tomanValue(rawPreferences.daily_limit, "IRR") : null } : null);
    setNotificationDeliveries((notificationDeliveriesResult.data ?? []) as NotificationDelivery[]);
    setLoading(false);
    return !error;
  }, [userId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  useEffect(() => {
    let cancelled = false;
    async function syncPushStatus() {
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!cancelled) setPushPermission("unsupported");
        return;
      }
      if (!cancelled) setPushPermission(Notification.permission);
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (!cancelled) setPushEnabled(Boolean(subscription));
    }
    void syncPushStatus();
    return () => { cancelled = true; };
  }, []);

  const refreshTokens = useCallback(async () => {
    const { data } = await supabase.from("automation_tokens").select("id,label,last_used_at,revoked_at,created_at").eq("user_id", userId).order("created_at", { ascending: false });
    setTokens((data ?? []) as AutomationToken[]);
  }, [userId]);

  const refreshData = useCallback(async () => {
    setRefreshing(true);
    setNotice(null);
    const refreshed = await loadData(true);
    setRefreshing(false);
    if (refreshed) setNotice("اطلاعات تازه شد.");
  }, [loadData]);

  const openView = (view: ViewId) => { setActiveView(view); setMenuOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const currency = "تومان";
  const name = profile?.full_name?.trim() || session.user.user_metadata?.full_name || session.user.email?.split("@")[0] || "دوست من";

  async function enablePushNotifications() {
    setNotice(null);
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushPermission("unsupported");
      setNotice("این مرورگر از اعلان‌های PWA پشتیبانی نمی‌کند.");
      return;
    }
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isInstalled = window.matchMedia("(display-mode: standalone)").matches
      || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    if (isIos && !isInstalled) {
      setNotice("در آیفون ابتدا دارایی‌بان را از بخش نصب به Home Screen اضافه کن و نسخه نصب‌شده را باز کن.");
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setPushPermission(permission);
      if (permission !== "granted") {
        setNotice("اجازه اعلان داده نشد؛ می‌توانی آن را از تنظیمات مرورگر یا گوشی فعال کنی.");
        return;
      }

      const registration = await navigator.serviceWorker.getRegistration()
        ?? await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription()
        ?? await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(VAPID_PUBLIC_KEY),
        });
      const serialized = subscription.toJSON();
      if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys.auth) {
        setNotice("ساخت اشتراک اعلان کامل نشد؛ دوباره تلاش کن.");
        return;
      }
      const { error } = await supabase.from("push_subscriptions").upsert({
        user_id: userId,
        endpoint: serialized.endpoint,
        p256dh: serialized.keys.p256dh,
        auth: serialized.keys.auth,
        user_agent: navigator.userAgent,
        last_used_at: new Date().toISOString(),
      }, { onConflict: "user_id,endpoint" });
      if (error) {
        await subscription.unsubscribe();
        setNotice("ذخیره اشتراک اعلان انجام نشد.");
        return;
      }
      setPushEnabled(true);
      setNotice("اعلان‌ها روی این دستگاه فعال شد.");
    } catch {
      setNotice("فعال‌سازی اعلان انجام نشد؛ برنامه را یک‌بار ببند و دوباره تلاش کن.");
    }
  }

  async function disablePushNotifications() {
    setNotice(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await supabase.from("push_subscriptions").delete().eq("user_id", userId).eq("endpoint", subscription.endpoint);
        await subscription.unsubscribe();
      }
      setPushEnabled(false);
      setNotice("اعلان روی این دستگاه غیرفعال شد.");
    } catch {
      setNotice("غیرفعال‌کردن اعلان انجام نشد؛ دوباره تلاش کن.");
    }
  }

  async function saveNotificationPreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    const form = new FormData(event.currentTarget);
    const dailyLimitEnabled = form.get("daily_limit_enabled") === "on";
    const dailySummaryEnabled = form.get("daily_summary_enabled") === "on";
    const dailyLimit = Number(form.get("daily_limit"));
    if (dailyLimitEnabled && (!Number.isFinite(dailyLimit) || dailyLimit <= 0)) {
      setNotice("برای هشدار روزانه یک سقف هزینه معتبر وارد کن.");
      setSaving(false);
      return;
    }
    const { error } = await supabase.from("notification_preferences").upsert({
      user_id: userId,
      daily_limit: dailyLimit > 0 ? rialValue(dailyLimit) : null,
      daily_limit_enabled: dailyLimitEnabled,
      daily_summary_enabled: dailySummaryEnabled,
      daily_summary_time: String(form.get("daily_summary_time") || "21:00"),
      timezone: "Asia/Tehran",
    }, { onConflict: "user_id" });
    if (error) setNotice("ذخیره تنظیمات اعلان انجام نشد.");
    else {
      setNotice("تنظیمات اعلان ذخیره شد.");
      await loadData(true);
    }
    setSaving(false);
  }

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("darayiban-theme", next);
  }

  function openNewTransaction() {
    setEditingTransaction(null);
    setModal("transaction");
  }

  function editTransaction(transaction: Transaction) {
    setEditingTransaction(transaction);
    setModal("transaction");
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("password_confirmation") ?? "");
    if (password.length < 8) {
      setNotice("رمز عبور باید حداقل ۸ کاراکتر باشد.");
      setSaving(false);
      return;
    }
    if (password !== confirmation) {
      setNotice("تکرار رمز عبور با رمز جدید یکسان نیست.");
      setSaving(false);
      return;
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setNotice(error.code === "reauthentication_needed" ? "برای تغییر رمز، یک‌بار دوباره با گوگل وارد شو و سپس تلاش کن." : "ساخت رمز ورود انجام نشد؛ دوباره تلاش کن.");
    } else {
      setPasswordReady(true);
      setModal(null);
      setNotice("رمز ورود ذخیره شد؛ از این به بعد می‌توانی با ایمیل و همین رمز وارد شوی.");
    }
    setSaving(false);
  }

  async function moveToTrash(transaction: Transaction) {
    setNotice(null);
    const { error } = await supabase.from("transactions").update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", transaction.id).eq("user_id", userId);
    if (error) setNotice("انتقال تراکنش به سطل زباله انجام نشد."); else { setNotice("تراکنش به سطل زباله منتقل شد."); await loadData(true); }
  }

  async function restoreTransaction(transaction: Transaction) {
    setNotice(null);
    const { error } = await supabase.from("transactions").update({ deleted_at: null, updated_at: new Date().toISOString() }).eq("id", transaction.id).eq("user_id", userId);
    if (error) setNotice("بازیابی تراکنش انجام نشد."); else { setNotice("تراکنش بازیابی شد."); await loadData(true); }
  }

  async function permanentlyDeleteTransaction(transaction: Transaction) {
    if (!window.confirm("این تراکنش برای همیشه حذف شود؟ این کار قابل بازگشت نیست.")) return;
    setNotice(null);
    const { error } = await supabase.from("transactions").delete().eq("id", transaction.id).eq("user_id", userId).not("deleted_at", "is", null);
    if (error) setNotice("حذف دائمی تراکنش انجام نشد."); else { setNotice("تراکنش برای همیشه حذف شد."); await loadData(true); }
  }

  async function deleteBudget(budget: Budget) {
    if (!window.confirm(`بودجه «${budget.name}» حذف شود؟`)) return;
    setNotice(null);
    const { error } = await supabase.from("budgets").delete().eq("id", budget.id).eq("user_id", userId);
    if (error) {
      setNotice("حذف بودجه انجام نشد؛ دوباره تلاش کن.");
      return;
    }
    setBudgets((current) => current.filter((item) => item.id !== budget.id));
    setNotice("بودجه حذف شد.");
  }

  async function saveTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setNotice(null);
    const form = new FormData(event.currentTarget);
    const transactionTime = parsePersianDateTimeInput(String(form.get("transaction_time")));
    if (!transactionTime) { setNotice("تاریخ و زمان را به شکل ۱۴۰۵/۰۵/۳۱ ۱۸:۳۰ وارد کن."); setSaving(false); return; }
    const payload = { type: form.get("type"), amount: rialValue(Number(form.get("amount"))), description: form.get("description"), from_card: form.get("from_card") || null, to_card: form.get("to_card") || null, transaction_time: transactionTime, category: form.get("category") || null, tags: parseTags(form.get("tags")), bank_name: form.get("bank_name") || null, currency: "IRR", updated_at: new Date().toISOString() };
    const { error } = editingTransaction
      ? await supabase.from("transactions").update(payload).eq("id", editingTransaction.id).eq("user_id", userId).is("deleted_at", null)
      : await supabase.from("transactions").insert({ ...payload, user_id: userId, source: "manual" });
    if (error) setNotice(editingTransaction ? "ویرایش تراکنش انجام نشد. اطلاعات را بررسی کن." : "ثبت تراکنش انجام نشد. اطلاعات را بررسی کن."); else { setModal(null); setEditingTransaction(null); await loadData(true); }
    setSaving(false);
  }

  async function saveObligation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setNotice(null);
    const form = new FormData(event.currentTarget); const amount = Number(form.get("amount"));
    const dueDateValue = String(form.get("due_date") ?? "").trim();
    const dueDate = dueDateValue ? parsePersianDateInput(dueDateValue) : null;
    if (dueDateValue && !dueDate) { setNotice("تاریخ سررسید را به شکل ۱۴۰۵/۰۶/۱۵ وارد کن."); setSaving(false); return; }
    const { error } = await supabase.from("obligations").insert({ user_id: userId, kind: form.get("kind"), title: form.get("title"), counterparty: form.get("counterparty") || null, original_amount: rialValue(amount), remaining_amount: rialValue(amount), currency: "IRR", due_date: dueDate, status: "open", notes: form.get("notes") || null });
    if (error) setNotice("ثبت بدهی یا طلب انجام نشد."); else { setModal(null); await loadData(true); }
    setSaving(false);
  }

  async function saveAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setNotice(null);
    const form = new FormData(event.currentTarget);
    const purchaseDateValue = String(form.get("purchase_date") ?? "").trim();
    const purchaseDate = purchaseDateValue ? parsePersianDateInput(purchaseDateValue) : null;
    if (purchaseDateValue && !purchaseDate) { setNotice("تاریخ ثبت را به شکل ۱۴۰۵/۰۵/۳۱ وارد کن."); setSaving(false); return; }
    const { error } = await supabase.from("assets").insert({ user_id: userId, asset_type: form.get("asset_type"), quantity: Number(form.get("quantity")), purchase_price: rialValue(Number(form.get("purchase_price"))), purchase_date: purchaseDate, notes: form.get("notes") || null });
    if (error) setNotice("ثبت دارایی انجام نشد."); else { setModal(null); await loadData(true); }
    setSaving(false);
  }

  async function saveBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setNotice(null);
    const form = new FormData(event.currentTarget);
    const periodStart = parsePersianDateInput(String(form.get("period_start")));
    const periodEnd = parsePersianDateInput(String(form.get("period_end")));
    if (!periodStart || !periodEnd || periodStart > periodEnd) { setNotice("بازه بودجه را با تاریخ شمسی معتبر وارد کن."); setSaving(false); return; }
    const budgetTag = normalizeTag(String(form.get("tag") ?? ""));
    const { error } = await supabase.from("budgets").insert({ user_id: userId, name: form.get("name"), amount: rialValue(Number(form.get("amount"))), currency: "IRR", period_start: periodStart, period_end: periodEnd, tag: budgetTag || null, notes: form.get("notes") || null });
    if (error) setNotice("ثبت بودجه انجام نشد."); else { setModal(null); await loadData(true); }
    setSaving(false);
  }

  const defaultDateTime = persianDateTimeInput(new Date());
  const currentPersianMonth = useMemo(() => persianMonthRange(), []);

  if (loading) return <main className="app-loading" dir="rtl"><BrandMark /><strong>دارایی‌بان</strong><span>در حال مرتب‌کردن اطلاعات مالی...</span></main>;

  return (
    <main className="app-shell" dir="rtl">
      <aside className={menuOpen ? "sidebar sidebar-open" : "sidebar"}>
        <div className="brand"><BrandMark /><div><strong>دارایی‌بان</strong><span>دستیار مالی شخصی</span></div></div>
        <button className="close-menu" onClick={() => setMenuOpen(false)} aria-label="بستن منو"><X /></button>
        <nav className="main-nav" aria-label="منوی اصلی"><p>فضای مالی من</p>{navItems.map((item) => { const Icon = item.icon; const count = item.id === "obligations" ? obligations.filter((obligation) => !["settled", "cancelled"].includes(obligation.status)).length : item.id === "trash" ? trashTransactions.length : 0; return <button className={activeView === item.id ? "nav-item active" : "nav-item"} key={item.id} onClick={() => openView(item.id)} type="button"><Icon size={20} /><span>{item.label}</span>{count > 0 && <em>{count.toLocaleString("fa-IR")}</em>}</button>; })}</nav>
        <div className="automation-card"><div className="automation-icon"><Sparkles size={20} /></div><strong>ثبت خودکار تراکنش</strong><p>اتومیشن آیفون را وصل کن تا پیامک‌های بانکی خودکار ثبت شوند.</p><button onClick={() => openView("academy")} type="button">راه‌اندازی اتومیشن</button></div>
        <div className="sidebar-settings"><button className="settings-link" onClick={toggleTheme} type="button"><Moon className="theme-light-only" size={19} /><Sun className="theme-dark-only" size={19} /><span className="theme-light-only">حالت تاریک</span><span className="theme-dark-only">حالت روشن</span></button><button className="settings-link" onClick={() => { setModal("password"); setMenuOpen(false); }} type="button"><LockKeyhole size={19} /> {googleOnlyAccount && !passwordReady ? "ساخت رمز ورود" : "تغییر رمز ورود"}</button></div>
        <div className="profile-card"><div className="avatar">{name.slice(0, 1)}</div><div><strong>{name}</strong><span>{session.user.email}</span></div><button className="logout-button" onClick={() => void supabase.auth.signOut()} aria-label="خروج" type="button"><LogOut size={18} /></button></div>
      </aside>
      {menuOpen && <button className="sidebar-backdrop" onClick={() => setMenuOpen(false)} aria-label="بستن منو" />}

      <div className="workspace">
        <header className="topbar"><button className="menu-button" onClick={() => setMenuOpen(true)} aria-label="باز کردن منو"><Menu /></button><div className="mobile-brand"><BrandMark /><strong>دارایی‌بان</strong></div><label className="search-box"><Search size={19} /><input value={search} onChange={(event) => setSearch(event.target.value)} onFocus={() => activeView !== "transactions" && setActiveView("transactions")} placeholder="جست‌وجو در تراکنش‌ها..." aria-label="جست‌وجو" /></label><button className="topbar-icon theme-toggle" onClick={toggleTheme} aria-label="تغییر حالت نمایش" title="تغییر حالت نمایش"><Moon className="theme-light-only" size={20} /><Sun className="theme-dark-only" size={20} /></button><button className="topbar-icon" onClick={() => openView("notifications")} aria-label="تنظیمات اعلان‌ها"><Bell size={20} />{(pushEnabled || obligations.some((item) => item.due_date && new Date(item.due_date) <= new Date())) && <i />}</button><button className="profile-chip" onClick={() => setModal("password")} type="button"><span>{name.slice(0, 1)}</span><div><strong>{name}</strong><small>تنظیم رمز ورود</small></div><LockKeyhole size={16} /></button></header>
        {notice && <div className="global-notice"><span>{notice}</span><button onClick={() => setNotice(null)} aria-label="بستن"><X size={17} /></button></div>}
        <div className="page-content">
          {activeView === "dashboard" && <DashboardView name={name} transactions={transactions} obligations={obligations} assets={assets} budgets={budgets} bankBalances={bankBalances} currency={currency} openModal={(kind) => kind === "transaction" ? openNewTransaction() : setModal(kind)} openView={openView} editTransaction={editTransaction} trashTransaction={(transaction) => void moveToTrash(transaction)} onRefresh={() => void refreshData()} refreshing={refreshing} showPasswordNudge={googleOnlyAccount && !passwordReady} openPassword={() => setModal("password")} />}
          {activeView === "transactions" && <TransactionsView transactions={transactions} currency={currency} search={search} setSearch={setSearch} openModal={openNewTransaction} onEdit={editTransaction} onTrash={(transaction) => void moveToTrash(transaction)} trashCount={trashTransactions.length} openTrash={() => openView("trash")} />}
          {activeView === "calendar" && <CalendarView transactions={transactions} obligations={obligations} currency={currency} onEdit={editTransaction} onTrash={(transaction) => void moveToTrash(transaction)} />}
          {activeView === "obligations" && <ObligationsView obligations={obligations} currency={currency} openModal={() => setModal("obligation")} />}
          {activeView === "assets" && <AssetsView assets={assets} targets={targets} currency={currency} openModal={() => setModal("asset")} />}
          {activeView === "budget" && <BudgetView budgets={budgets} targets={targets} transactions={transactions} currency={currency} openModal={() => setModal("budget")} onDelete={(budget) => void deleteBudget(budget)} />}
          {activeView === "academy" && <AcademyView tokens={tokens} userId={userId} refreshTokens={refreshTokens} />}
          {activeView === "notifications" && <NotificationView preferences={notificationPreferences} deliveries={notificationDeliveries} pushEnabled={pushEnabled} permission={pushPermission} saving={saving} onEnable={enablePushNotifications} onDisable={disablePushNotifications} onSave={saveNotificationPreferences} />}
          {activeView === "install" && <InstallView />}
          {activeView === "trash" && <TrashView transactions={trashTransactions} currency={currency} onRestore={(transaction) => void restoreTransaction(transaction)} onDelete={(transaction) => void permanentlyDeleteTransaction(transaction)} />}
        </div>
      </div>

      <nav className="mobile-nav" aria-label="منوی پایین موبایل">{navItems.slice(0, 5).map((item) => { const Icon = item.icon; return <button key={item.id} className={activeView === item.id ? "active" : ""} onClick={() => openView(item.id)} type="button"><Icon size={20} /><span>{item.label.replace("تقویم مالی", "تقویم").replace("بدهی و طلب", "بدهی‌ها")}</span></button>; })}</nav>

      {modal === "password" && <Modal title={googleOnlyAccount && !passwordReady ? "ساخت رمز ورود" : "تغییر رمز ورود"} onClose={() => setModal(null)}><form className="data-form password-form" onSubmit={savePassword}><p>{googleOnlyAccount && !passwordReady ? "این رمز به همان حساب گوگل وصل می‌شود؛ بعد از ذخیره می‌توانی با ایمیل و رمز وارد شوی." : "رمز جدید را وارد کن؛ نشست فعلی حسابت حفظ می‌شود."}</p><label><span>ایمیل حساب</span><input dir="ltr" value={session.user.email ?? ""} readOnly /></label><label><span>رمز جدید</span><input name="password" type="password" minLength={8} autoComplete="new-password" placeholder="حداقل ۸ کاراکتر" dir="ltr" required /></label><label><span>تکرار رمز جدید</span><input name="password_confirmation" type="password" minLength={8} autoComplete="new-password" placeholder="رمز را دوباره وارد کن" dir="ltr" required /></label><button className="primary-button form-submit" disabled={saving} type="submit">{saving ? "در حال ذخیره..." : "ذخیره رمز ورود"}</button></form></Modal>}
      {modal === "transaction" && <Modal title={editingTransaction ? "ویرایش تراکنش" : "تراکنش جدید"} onClose={() => { setModal(null); setEditingTransaction(null); }}><form className="data-form" onSubmit={saveTransaction}>
        <div className="segmented"><label><input type="radio" name="type" value="withdrawal" defaultChecked={!editingTransaction || editingTransaction.type === "withdrawal"} /><span>برداشت</span></label><label><input type="radio" name="type" value="deposit" defaultChecked={editingTransaction?.type === "deposit"} /><span>واریز</span></label></div>
        <label><span>مبلغ به {currency}</span><input name="amount" type="number" min="1" inputMode="decimal" defaultValue={editingTransaction ? numberValue(editingTransaction.amount) : undefined} placeholder="مثلاً ۲۵۰٬۰۰۰" required /></label>
        <label><span>بابت چه چیزی؟</span><input name="description" defaultValue={editingTransaction?.description ?? ""} placeholder="خرید، حقوق، انتقال وجه..." required /></label>
        <label><span>تگ‌ها</span><div className="tag-input"><Tag size={17} /><input name="tags" defaultValue={editingTransaction?.tags?.join("، ") ?? ""} placeholder="مثلاً اسنپ، محل کار" /></div><small>برای چند تگ از ویرگول استفاده کن؛ بودجه‌ها با همین تگ‌ها محاسبه می‌شوند.</small></label>
        <div className="form-grid"><label><span>از کارت / حساب</span><input name="from_card" defaultValue={editingTransaction?.from_card ?? ""} placeholder="شماره یا نام حساب" /></label><label><span>به کارت / حساب</span><input name="to_card" defaultValue={editingTransaction?.to_card ?? ""} placeholder="اختیاری" /></label><label><span>دسته‌بندی</span><select name="category" defaultValue={editingTransaction?.category ?? "سایر"}>{transactionCategories.map((category) => <option key={category}>{category}</option>)}</select></label><label><span>بانک</span><input name="bank_name" defaultValue={editingTransaction?.bank_name ?? ""} placeholder="مثلاً سامان" /></label></div>
        <label><span>تاریخ و زمان شمسی</span><input className="persian-date-input" dir="ltr" name="transaction_time" type="text" inputMode="numeric" defaultValue={editingTransaction ? persianDateTimeInput(editingTransaction.transaction_time) : defaultDateTime} placeholder="۱۴۰۵/۰۵/۳۱ ۱۸:۳۰" required /></label>
        <button className="primary-button form-submit" disabled={saving} type="submit">{saving ? "در حال ذخیره..." : editingTransaction ? "ذخیره تغییرات" : "ثبت تراکنش"}</button>
      </form></Modal>}
      {modal === "obligation" && <Modal title="بدهی یا طلب جدید" onClose={() => setModal(null)}><form className="data-form" onSubmit={saveObligation}><div className="segmented"><label><input type="radio" name="kind" value="debt" defaultChecked /><span>من بدهکارم</span></label><label><input type="radio" name="kind" value="receivable" /><span>من طلبکارم</span></label></div><label><span>عنوان</span><input name="title" placeholder="مثلاً قسط لپ‌تاپ" required /></label><div className="form-grid"><label><span>طرف حساب</span><input name="counterparty" placeholder="نام شخص یا مجموعه" /></label><label><span>مبلغ به {currency}</span><input name="amount" type="number" min="1" required /></label><label><span>تاریخ سررسید شمسی</span><input className="persian-date-input" dir="ltr" name="due_date" type="text" inputMode="numeric" placeholder="۱۴۰۵/۰۶/۱۵" /></label></div><label><span>یادداشت</span><textarea name="notes" placeholder="توضیح کوتاه..." /></label><button className="primary-button form-submit" disabled={saving} type="submit">{saving ? "در حال ثبت..." : "ثبت مورد"}</button></form></Modal>}
      {modal === "asset" && <Modal title="دارایی جدید" onClose={() => setModal(null)}><form className="data-form" onSubmit={saveAsset}><label><span>نوع دارایی</span><select name="asset_type" defaultValue="gold">{Object.entries(assetNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className="form-grid"><label><span>مقدار / تعداد</span><input name="quantity" type="number" min="0" step="any" required /></label><label><span>ارزش هر واحد به {currency}</span><input name="purchase_price" type="number" min="0" step="any" required /></label><label><span>تاریخ ثبت شمسی</span><input className="persian-date-input" dir="ltr" name="purchase_date" type="text" inputMode="numeric" defaultValue={persianDateInput(new Date())} placeholder="۱۴۰۵/۰۵/۳۱" /></label></div><label><span>یادداشت</span><textarea name="notes" placeholder="مثلاً طلای آب‌شده یا کیف پول..." /></label><button className="primary-button form-submit" disabled={saving} type="submit">{saving ? "در حال ثبت..." : "افزودن به سبد"}</button></form></Modal>}
      {modal === "budget" && <Modal title="بودجه جدید" onClose={() => setModal(null)}><form className="data-form" onSubmit={saveBudget}><label><span>نام بودجه</span><input name="name" defaultValue="بودجه ماهانه" required /></label><label><span>سقف هزینه به {currency}</span><input name="amount" type="number" min="1" required /></label><label><span>تگ مرتبط</span><div className="tag-input"><Tag size={17} /><input name="tag" placeholder="مثلاً اسنپ" /></div><small>اگر تگ بگذاری، فقط تراکنش‌های دارای همان تگ از این بودجه کم می‌شوند.</small></label><div className="form-grid"><label><span>شروع دوره شمسی</span><input className="persian-date-input" dir="ltr" name="period_start" type="text" inputMode="numeric" defaultValue={persianDateInput(currentPersianMonth.start)} required /></label><label><span>پایان دوره شمسی</span><input className="persian-date-input" dir="ltr" name="period_end" type="text" inputMode="numeric" defaultValue={persianDateInput(currentPersianMonth.end)} required /></label></div><label><span>یادداشت</span><textarea name="notes" placeholder="هدف این بودجه..." /></label><button className="primary-button form-submit" disabled={saving} type="submit">{saving ? "در حال ثبت..." : "ساخت بودجه"}</button></form></Modal>}
    </main>
  );
}
