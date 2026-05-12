import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { supabase } from '@/lib/supabase';
import { getDeviceId, getDeviceInfo } from '@/lib/deviceId';
import { log } from '@/lib/logger';

export type DeviceSessionStatus = 'idle' | 'checking' | 'ok' | 'limit_reached' | 'evicted';

export interface OtherDeviceInfo {
  device_name?: string | null;
  device_model?: string | null;
  os_name?: string | null;
  last_active_at?: string | null;
}

interface UseDeviceSessionOptions {
  userId: string | null;
  enabled: boolean;
}

const HEARTBEAT_MS = 60 * 1000;

/**
 * Manages the patient app device session via Supabase RPCs.
 * - register_device on mount / userId change
 * - heartbeat every 60s while app is foregrounded
 * - on network failures, defaults to 'ok' so the patient is not blocked
 */
export function useDeviceSession({ userId, enabled }: UseDeviceSessionOptions) {
  const [status, setStatus] = useState<DeviceSessionStatus>('idle');
  const [otherDevice, setOtherDevice] = useState<OtherDeviceInfo | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const isMountedRef = useRef<boolean>(true);

  const registerDevice = useCallback(
    async (force: boolean = false): Promise<DeviceSessionStatus> => {
      if (!userId) return 'idle';
      try {
        const deviceId = await getDeviceId();
        const info = getDeviceInfo();
        const { data, error } = await supabase.rpc('register_device', {
          p_device_id: deviceId,
          p_app_type: 'patient',
          p_device_name: info.device_name,
          p_device_model: info.device_model,
          p_os_name: info.os_name,
          p_os_version: info.os_version,
          p_app_version: info.app_version,
          p_force: force,
        });
        if (error) {
          log('[useDeviceSession] register_device error:', error.message);
          return 'ok';
        }
        const row = Array.isArray(data) ? data[0] : data;
        const result = row?.status as string | undefined;
        if (result === 'limit_reached') {
          setOtherDevice({
            device_name: row?.other_device_name ?? null,
            device_model: row?.other_device_model ?? null,
            os_name: row?.other_os_name ?? null,
            last_active_at: row?.other_last_active_at ?? null,
          });
          return 'limit_reached';
        }
        setOtherDevice(null);
        return 'ok';
      } catch (e) {
        log('[useDeviceSession] register_device exception:', e);
        return 'ok';
      }
    },
    [userId]
  );

  const sendHeartbeat = useCallback(async () => {
    if (!userId) return;
    try {
      const deviceId = await getDeviceId();
      const { data, error } = await supabase.rpc('device_heartbeat', {
        p_device_id: deviceId,
      });
      if (error) {
        log('[useDeviceSession] heartbeat error:', error.message);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      const result = (row?.status as string | undefined) ?? (typeof data === 'string' ? data : undefined);
      if (result === 'evicted' || result === 'not_found') {
        if (isMountedRef.current) setStatus('evicted');
      }
    } catch (e) {
      log('[useDeviceSession] heartbeat exception:', e);
    }
  }, [userId]);

  const startHeartbeat = useCallback(() => {
    if (heartbeatRef.current) return;
    heartbeatRef.current = setInterval(() => {
      if (appStateRef.current === 'active') {
        void sendHeartbeat();
      }
    }, HEARTBEAT_MS);
  }, [sendHeartbeat]);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  const useThisDevice = useCallback(async () => {
    setStatus('checking');
    const result = await registerDevice(true);
    if (isMountedRef.current) {
      setStatus(result);
      if (result === 'ok') startHeartbeat();
    }
  }, [registerDevice, startHeartbeat]);

  const retry = useCallback(async () => {
    setStatus('checking');
    const result = await registerDevice(false);
    if (isMountedRef.current) {
      setStatus(result);
      if (result === 'ok') startHeartbeat();
    }
  }, [registerDevice, startHeartbeat]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !userId) {
      stopHeartbeat();
      setStatus('idle');
      setOtherDevice(null);
      return;
    }
    let cancelled = false;
    setStatus('checking');
    void (async () => {
      const result = await registerDevice(false);
      if (cancelled) return;
      setStatus(result);
      if (result === 'ok') startHeartbeat();
    })();
    return () => {
      cancelled = true;
      stopHeartbeat();
    };
  }, [enabled, userId, registerDevice, startHeartbeat, stopHeartbeat]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      appStateRef.current = next;
      if (next === 'active' && enabled && userId && status === 'ok') {
        void sendHeartbeat();
      }
    });
    return () => sub.remove();
  }, [enabled, userId, status, sendHeartbeat]);

  return {
    status,
    otherDevice,
    useThisDevice,
    retry,
  };
}
