"use client";
import React from "react";
import { Bell, BellOff, Loader2, Mail, MonitorSmartphone, Send, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/trpc/react";
import { cn } from "@/lib/utils";

/** VAPID keys are URL-safe base64; the Push API wants bytes. */
function keyBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type DeviceState = "checking" | "unsupported" | "denied" | "off" | "on";

function useDevicePush(vapid: string | null) {
  const [state, setState] = React.useState<DeviceState>("checking");
  const [endpoint, setEndpoint] = React.useState<string | null>(null);
  React.useEffect(() => {
    void (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      setEndpoint(sub?.endpoint ?? null);
      setState(sub ? "on" : "off");
    })();
  }, [vapid]);
  return { state, setState, endpoint, setEndpoint };
}

const field = "h-8 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const hours = Array.from({ length: 24 }, (_, h) => ({ h, label: `${h % 12 || 12}:00 ${h < 12 ? "AM" : "PM"}` }));

function deviceName(ua: string | null) {
  if (!ua) return "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Mac OS/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${browser} on ${os}`;
}

/** Tasks → Reminders: push on each device, reminder defaults and the morning digest. */
export function RemindersPanel() {
  const utils = api.useUtils();
  const { data, isLoading } = api.tasks.notifications.useQuery();
  const device = useDevicePush(data?.vapidPublicKey ?? null);
  const refresh = () => void utils.tasks.notifications.invalidate();
  const subscribe = api.tasks.subscribePush.useMutation({ onSuccess: refresh });
  const unsubscribe = api.tasks.unsubscribePush.useMutation({ onSuccess: refresh });
  const remove = api.tasks.removeDevice.useMutation({ onSuccess: refresh });
  const test = api.tasks.testPush.useMutation({ onSuccess: (r) => toast.success(`Test sent to ${r.sent} device${r.sent === 1 ? "" : "s"}`), onError: (e) => toast.error(e.message) });
  const digest = api.tasks.sendDigestNow.useMutation({ onSuccess: () => toast.success("Digest sent. Check your inbox."), onError: (e) => toast.error(e.message) });
  const save = api.tasks.saveNotificationSettings.useMutation({
    onSuccess: () => {
      refresh();
      void utils.tasks.list.invalidate();
      toast.success("Reminder settings saved");
    },
    onError: (e) => toast.error(e.message),
  });
  const [form, setForm] = React.useState<NonNullable<typeof data>["settings"] | null>(null);
  React.useEffect(() => {
    if (data) setForm(data.settings);
  }, [data]);
  const [busy, setBusy] = React.useState(false);

  if (isLoading || !data || !form) return <Loader2 className="mx-auto mt-16 size-5 animate-spin text-muted-foreground" />;

  const turnOn = async () => {
    if (!data.vapidPublicKey) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        device.setState(permission === "denied" ? "denied" : "off");
        toast.error("Notifications weren't allowed in this browser.");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(data.vapidPublicKey) }));
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await subscribe.mutateAsync({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, userAgent: navigator.userAgent.slice(0, 300) });
      device.setEndpoint(json.endpoint);
      device.setState("on");
      toast.success("Reminders are on for this device");
    } catch (e) {
      toast.error(`Couldn't turn on notifications: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  const turnOff = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await unsubscribe.mutateAsync({ endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      device.setEndpoint(null);
      device.setState("off");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* This device */}
      <section className="rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-start gap-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
            <MonitorSmartphone className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Push notifications on this device</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {!data.pushConfigured
                ? "Push isn't set up on the server yet: add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Vercel."
                : device.state === "unsupported"
                  ? "This browser can't receive push notifications. On iPhone, add everythingVA to your Home Screen first."
                  : device.state === "denied"
                    ? "Notifications are blocked for this site. Allow them in the browser's site settings, then reload."
                    : device.state === "on"
                      ? "On. Reminders pop up here even when everythingVA isn't open."
                      : "Off on this device. Turn it on to get a pop-up before tasks are due."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {device.state === "on" ? (
              <>
                <Button size="sm" variant="outline" onClick={() => test.mutate()} disabled={test.isPending}>
                  {test.isPending ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Send className="mr-1.5 size-3.5" />}
                  Send a test
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void turnOff()} disabled={busy}>
                  <BellOff className="mr-1.5 size-3.5" /> Turn off
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => void turnOn()} disabled={busy || !data.pushConfigured || device.state === "unsupported" || device.state === "denied" || device.state === "checking"}>
                {busy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Bell className="mr-1.5 size-3.5" />}
                Turn on for this device
              </Button>
            )}
          </div>
        </div>
        {data.devices.length > 0 && (
          <ul className="mt-4 divide-y border-t pt-1">
            {data.devices.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-2 text-sm">
                <Smartphone className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">
                  {deviceName(d.userAgent)}
                  {d.endpoint === device.endpoint && <span className="ml-1.5 text-xs text-emerald-600">this device</span>}
                </span>
                <span className="text-[11px] text-muted-foreground">{d.lastUsedAt ? `last sent ${new Date(d.lastUsedAt).toLocaleDateString()}` : `added ${new Date(d.createdAt).toLocaleDateString()}`}</span>
                <Button size="icon" variant="ghost" className="size-7" aria-label="Remove device" onClick={() => remove.mutate({ id: d.id })}>
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Settings */}
      <section className="rounded-2xl border bg-card p-5">
        <p className="text-sm font-semibold">When to remind me</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Times use your time zone ({form.timezone}). Each task can override the default in its detail panel.</p>
        <div className="mt-4 space-y-3 text-sm">
          <label className="flex items-center justify-between gap-3">
            <span>Push reminders</span>
            <input type="checkbox" className="size-4" checked={form.pushEnabled} onChange={(e) => setForm({ ...form, pushEnabled: e.target.checked })} />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>Tasks with a time: remind me</span>
            <select className={field} value={form.defaultReminderMinutes} onChange={(e) => setForm({ ...form, defaultReminderMinutes: Number(e.target.value) })}>
              {[0, 5, 10, 15, 30, 60, 120].map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? "at the due time" : m < 60 ? `${m} min before` : `${m / 60} h before`}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>Tasks due on a day: remind me at</span>
            <select className={field} value={form.dateOnlyReminderHour} onChange={(e) => setForm({ ...form, dateOnlyReminderHour: Number(e.target.value) })}>
              {hours.map((h) => (
                <option key={h.h} value={h.h}>
                  {h.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-5 border-t pt-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Mail className="size-4" /> Morning email digest
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">What's overdue, due today and tomorrow, sent from your own mailbox to yourself.</p>
          <div className="mt-3 space-y-3 text-sm">
            <label className="flex items-center justify-between gap-3">
              <span>Send the digest</span>
              <input type="checkbox" className="size-4" checked={form.digestEnabled} onChange={(e) => setForm({ ...form, digestEnabled: e.target.checked })} />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span>At</span>
              <select className={field} value={form.digestHour} onChange={(e) => setForm({ ...form, digestHour: Number(e.target.value) })}>
                {hours.map((h) => (
                  <option key={h.h} value={h.h}>
                    {h.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center justify-between gap-3">
              <span>From and to</span>
              <select className={cn(field, "max-w-[16rem]")} value={form.digestAccountId ?? ""} onChange={(e) => setForm({ ...form, digestAccountId: e.target.value || null })}>
                <option value="">First connected account</option>
                {data.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.emailAddress}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={save.isPending}
            onClick={() =>
              save.mutate({
                pushEnabled: form.pushEnabled,
                defaultReminderMinutes: form.defaultReminderMinutes,
                dateOnlyReminderHour: form.dateOnlyReminderHour,
                digestEnabled: form.digestEnabled,
                digestHour: form.digestHour,
                digestAccountId: form.digestAccountId,
              })
            }
          >
            {save.isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}Save
          </Button>
          <Button size="sm" variant="outline" onClick={() => digest.mutate()} disabled={digest.isPending}>
            {digest.isPending ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Mail className="mr-1.5 size-3.5" />}
            Send today's digest now
          </Button>
        </div>
      </section>

      <p className="px-1 text-[11px] text-muted-foreground">
        Reminders go out when the reminder job runs. For on-time reminders it needs to run every few minutes (see docs/tasks.md); otherwise they arrive once a day with the digest.
      </p>
    </div>
  );
}
