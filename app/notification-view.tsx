"use client";

import { Bell, Check, ShieldCheck, Smartphone, Target, X } from "lucide-react";
import type { FormEvent } from "react";
import type { NotificationDelivery, NotificationPreferences } from "./finance-types";
import { dateTime, numberValue } from "./finance-types";

type Props = {
  preferences: NotificationPreferences | null;
  deliveries: NotificationDelivery[];
  pushEnabled: boolean;
  permission: NotificationPermission | "unsupported";
  saving: boolean;
  onEnable: () => Promise<void>;
  onDisable: () => Promise<void>;
  onSave: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

export function NotificationView({
  preferences,
  deliveries,
  pushEnabled,
  permission,
  saving,
  onEnable,
  onDisable,
  onSave,
}: Props) {
  const supported = permission !== "unsupported";
  const statusText = !supported
    ? "این مرورگر از اعلان PWA پشتیبانی نمی‌کند"
    : pushEnabled
      ? "اعلان روی این دستگاه فعال است"
      : permission === "denied"
        ? "اجازه اعلان در تنظیمات دستگاه بسته شده"
        : "اعلان روی این دستگاه فعال نیست";

  return (
    <section className="data-view notifications-view">
      <div className="view-header">
        <div>
          <span>هشدارهای هوشمند</span>
          <h1>تنظیمات اعلان‌ها</h1>
          <p>سقف هزینه روزانه و زمان دریافت گزارش مالی را خودت مشخص کن.</p>
        </div>
      </div>

      <div className="notification-layout">
        <article className="panel push-device-card">
          <div className={pushEnabled ? "push-status-icon active" : "push-status-icon"}>
            {pushEnabled ? <Check size={24} /> : <Bell size={24} />}
          </div>
          <div>
            <span>این دستگاه</span>
            <h2>{statusText}</h2>
            <p>هر گوشی یا مرورگر باید یک‌بار جداگانه برای دریافت اعلان فعال شود.</p>
          </div>
          {pushEnabled ? (
            <button className="secondary-button notification-device-button" type="button" onClick={() => void onDisable()}>
              <X size={18} /> غیرفعال‌کردن
            </button>
          ) : (
            <button className="primary-button notification-device-button" type="button" disabled={!supported || permission === "denied"} onClick={() => void onEnable()}>
              <Bell size={18} /> فعال‌کردن اعلان
            </button>
          )}
        </article>

        <form className="panel notification-form data-form" onSubmit={onSave}>
          <div className="column-head"><div><h2>قانون‌های اعلان</h2><span>همه مبلغ‌ها به تومان‌اند</span></div></div>

          <label className="notification-rule">
            <span className="rule-icon"><Target size={20} /></span>
            <span className="rule-copy"><strong>هشدار سقف هزینه روزانه</strong><small>وقتی مجموع برداشت‌های امروز به این مبلغ برسد، فقط یک‌بار هشدار می‌گیری.</small></span>
            <input name="daily_limit_enabled" type="checkbox" defaultChecked={preferences?.daily_limit_enabled ?? false} />
          </label>
          <label className="limit-input">
            <span>سقف هزینه روزانه</span>
            <div><input name="daily_limit" type="number" min="1" inputMode="numeric" defaultValue={preferences?.daily_limit ? numberValue(preferences.daily_limit) : ""} placeholder="مثلاً ۱٬۵۰۰٬۰۰۰" /><em>تومان</em></div>
          </label>

          <label className="notification-rule">
            <span className="rule-icon summary"><Bell size={20} /></span>
            <span className="rule-copy"><strong>گزارش هزینه روزانه</strong><small>مجموع برداشت‌ها و تعداد تراکنش‌های همان روز را در ساعت انتخابی می‌فرستد.</small></span>
            <input name="daily_summary_enabled" type="checkbox" defaultChecked={preferences?.daily_summary_enabled ?? false} />
          </label>
          <label className="limit-input">
            <span>ساعت ارسال گزارش</span>
            <div><input dir="ltr" name="daily_summary_time" type="time" defaultValue={(preferences?.daily_summary_time ?? "21:00").slice(0, 5)} /><em>به وقت ایران</em></div>
          </label>

          <button className="primary-button form-submit" type="submit" disabled={saving}>
            {saving ? "در حال ذخیره..." : "ذخیره تنظیمات اعلان"}
          </button>
        </form>

        <article className="panel notification-history">
          <div className="column-head"><div><h2>اعلان‌های اخیر</h2><span>{deliveries.length.toLocaleString("fa-IR")} مورد</span></div></div>
          {deliveries.length ? (
            <div className="notification-history-list">
              {deliveries.slice(0, 8).map((item) => (
                <div key={item.id}>
                  <span className={item.status === "sent" ? "delivery-dot sent" : "delivery-dot"} />
                  <div><strong>{item.title}</strong><p>{item.body}</p><time>{dateTime(item.sent_at ?? item.created_at)}</time></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="notification-empty"><Bell size={24} /><strong>هنوز اعلانی ارسال نشده</strong><p>بعد از فعال‌سازی، گزارش‌ها و هشدارهای ارسال‌شده اینجا دیده می‌شوند.</p></div>
          )}
        </article>
      </div>

      <div className="install-note notification-note"><ShieldCheck size={20} /><div><strong>در آیفون، برنامه باید روی Home Screen نصب باشد</strong><p>دارایی‌بان را از بخش «نصب برنامه» اضافه کن، سپس نسخه نصب‌شده را باز کن و همین‌جا روی «فعال‌کردن اعلان» بزن.</p></div><Smartphone size={22} /></div>
    </section>
  );
}
