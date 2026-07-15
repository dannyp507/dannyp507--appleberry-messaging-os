'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api/client';

export type PushPermission = 'unsupported' | 'default' | 'granted' | 'denied' | 'subscribed';

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))).buffer as ArrayBuffer;
}

export function usePushNotifications() {
  const [permission, setPermission] = useState<PushPermission>('default');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPermission('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setPermission('denied');
      return;
    }
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        if (sub) setPermission('subscribed');
      });
    });
  }, []);

  const subscribe = useCallback(async () => {
    setLoading(true);
    try {
      // iOS Safari PWA requires explicit requestPermission() from a user gesture
      const perm = await Notification.requestPermission();
      if (perm === 'denied') { setPermission('denied'); return; }
      if (perm !== 'granted') return;

      const reg = await navigator.serviceWorker.ready;
      const { data } = await api.get<{ publicKey: string | null }>('/notifications/push/vapid-key');
      if (!data.publicKey) throw new Error('Push not configured on server');

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.publicKey),
      });

      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await api.post('/notifications/push/subscribe', {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        userAgent: navigator.userAgent,
      });
      setPermission('subscribed');
    } catch (err) {
      console.error('Push subscribe failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api.delete('/notifications/push/subscribe', { data: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setPermission('default');
    } finally {
      setLoading(false);
    }
  }, []);

  return { permission, loading, subscribe, unsubscribe };
}
