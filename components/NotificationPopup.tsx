import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Image,
  Linking,
  ScrollView,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import { ScaledText } from '@/components/ScaledText';
import Colors from '@/constants/colors';
import { NotificationRecipient, Language } from '@/types';
import { log } from '@/lib/logger';
import { X, ExternalLink, Play, Bell } from 'lucide-react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function getNotificationTitle(n: NotificationRecipient['notifications'], language: Language | null): string {
  const lang = language || 'en';
  if (lang === 'zh_hant' || lang === 'zh_hans') return n.title_zh || n.title_en;
  return n.title_en || n.title_zh;
}

function getNotificationBody(n: NotificationRecipient['notifications'], language: Language | null): string {
  const lang = language || 'en';
  if (lang === 'zh_hant' || lang === 'zh_hans') return n.body_zh || n.body_en;
  return n.body_en || n.body_zh;
}

interface NotificationPopupProps {
  patientId: string | null;
}

export function NotificationPopup({ patientId }: NotificationPopupProps) {
  const { t, language } = useApp();
  const queryClient = useQueryClient();
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [visible, setVisible] = useState<boolean>(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  const notificationsQuery = useQuery({
    queryKey: ['notifications', patientId],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      log('[NotificationPopup] Fetching notifications for patient:', patientId);
      const { data, error } = await supabase
        .from('notification_recipients')
        .select('*, notifications(*)')
        .eq('patient_id', patientId!)
        .eq('notifications.is_active', true)
        .lte('notifications.start_date', today)
        .gte('notifications.end_date', today);

      if (error) {
        log('[NotificationPopup] Fetch error:', error);
        throw error;
      }

      const filtered = (data || []).filter((item: NotificationRecipient) => {
        if (!item.notifications) return false;
        if (item.dismissed_date === today) return false;
        return true;
      }) as NotificationRecipient[];

      log('[NotificationPopup] Active notifications:', filtered.length);
      return filtered;
    },
    enabled: !!patientId,
  });

  const activeNotifications = useMemo(() => notificationsQuery.data || [], [notificationsQuery.data]);

  const unreadOnes = useMemo(
    () => activeNotifications.filter(n => !n.read_at),
    [activeNotifications]
  );

  useEffect(() => {
    if (unreadOnes.length > 0 && !visible) {
      setCurrentIndex(0);
      setVisible(true);
    }
  }, [unreadOnes.length, visible]);

  useEffect(() => {
    if (visible) {
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.9);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, friction: 8, tension: 65, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, currentIndex, fadeAnim, scaleAnim]);

  const markReadMutation = useMutation({
    mutationFn: async (recipientId: string) => {
      log('[NotificationPopup] Marking read:', recipientId);
      const { error } = await supabase
        .from('notification_recipients')
        .update({ read_at: new Date().toISOString() })
        .eq('id', recipientId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications', patientId] });
    },
  });

  const dismissTodayMutation = useMutation({
    mutationFn: async (recipientId: string) => {
      const today = new Date().toISOString().split('T')[0];
      log('[NotificationPopup] Dismissing for today:', recipientId);
      const { error } = await supabase
        .from('notification_recipients')
        .update({ dismissed_date: today })
        .eq('id', recipientId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications', patientId] });
    },
  });

  const handleOk = useCallback(() => {
    if (unreadOnes.length === 0) {
      setVisible(false);
      return;
    }
    const current = unreadOnes[currentIndex];
    if (current) {
      markReadMutation.mutate(current.id);
    }
    if (currentIndex < unreadOnes.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setVisible(false);
    }
  }, [unreadOnes, currentIndex, markReadMutation]);

  const handleDismissToday = useCallback(() => {
    if (unreadOnes.length === 0) {
      setVisible(false);
      return;
    }
    const current = unreadOnes[currentIndex];
    if (current) {
      dismissTodayMutation.mutate(current.id);
    }
    if (currentIndex < unreadOnes.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setVisible(false);
    }
  }, [unreadOnes, currentIndex, dismissTodayMutation]);

  const handleOpenLink = useCallback((url: string) => {
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      void Linking.openURL(url);
    }
  }, []);

  const currentNotification = unreadOnes[currentIndex];

  if (!visible || !currentNotification) return null;

  const notification = currentNotification.notifications;
  const title = getNotificationTitle(notification, language);
  const body = getNotificationBody(notification, language);
  const counterText = String(currentIndex + 1) + ' / ' + String(unreadOnes.length);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={() => setVisible(false)}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.popup,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => setVisible(false)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <X size={20} color={Colors.textSecondary} />
          </TouchableOpacity>

          {unreadOnes.length > 1 && (
            <View style={styles.counter}>
              <Text style={styles.counterText}>
                {counterText}
              </Text>
            </View>
          )}

          <ScrollView
            style={styles.scrollContent}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.iconBadge}>
              <Bell size={24} color={Colors.primary} />
            </View>

            <ScaledText size={20} weight="bold" color={Colors.textPrimary} style={styles.title}>
              {title || ''}
            </ScaledText>

            <ScaledText size={15} color={Colors.textSecondary} style={styles.body}>
              {body || ''}
            </ScaledText>

            {notification.type === 'poster' && notification.image_url && (
              <Image
                source={{ uri: notification.image_url }}
                style={styles.posterImage}
                resizeMode="contain"
              />
            )}

            {notification.type === 'video' && notification.video_url && (
              <TouchableOpacity
                style={styles.mediaButton}
                onPress={() => handleOpenLink(notification.video_url!)}
                activeOpacity={0.7}
              >
                <View style={styles.playCircle}>
                  <Play size={20} color={Colors.white} fill={Colors.white} />
                </View>
                <ScaledText size={15} weight="600" color={Colors.primary}>
                  {t('playVideo')}
                </ScaledText>
              </TouchableOpacity>
            )}

            {notification.type === 'link' && notification.link_url && (
              <TouchableOpacity
                style={styles.mediaButton}
                onPress={() => handleOpenLink(notification.link_url!)}
                activeOpacity={0.7}
              >
                <ExternalLink size={18} color={Colors.primary} />
                <ScaledText size={15} weight="600" color={Colors.primary}>
                  {t('viewMore')}
                </ScaledText>
              </TouchableOpacity>
            )}

            {notification.image_url && notification.type !== 'poster' && (
              <Image
                source={{ uri: notification.image_url }}
                style={styles.inlineImage}
                resizeMode="cover"
              />
            )}
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.okButton}
              onPress={handleOk}
              activeOpacity={0.7}
            >
              <ScaledText size={16} weight="bold" color={Colors.white}>
                {t('ok')}
              </ScaledText>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dismissButton}
              onPress={handleDismissToday}
              activeOpacity={0.7}
            >
              <ScaledText size={13} color={Colors.textSecondary}>
                {t('dontShowToday')}
              </ScaledText>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

export function NotificationBellBadge({ patientId }: { patientId: string | null }) {
  const notificationsQuery = useQuery({
    queryKey: ['notifications', patientId],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('notification_recipients')
        .select('*, notifications(*)')
        .eq('patient_id', patientId!)
        .eq('notifications.is_active', true)
        .lte('notifications.start_date', today)
        .gte('notifications.end_date', today);

      if (error) throw error;

      return (data || []).filter((item: NotificationRecipient) => {
        if (!item.notifications) return false;
        if (item.dismissed_date === today) return false;
        return true;
      }) as NotificationRecipient[];
    },
    enabled: !!patientId,
  });

  const unreadCount = (notificationsQuery.data || []).filter(n => !n.read_at).length;

  return (
    <View style={styles.bellContainer}>
      <Bell size={22} color={Colors.textSecondary} />
      {unreadCount > 0 && (
        <View style={styles.bellBadge}>
          <ScaledText size={10} weight="bold" color={Colors.white}>
            {unreadCount > 9 ? '9+' : String(unreadCount)}
          </ScaledText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  popup: {
    width: Math.min(SCREEN_WIDTH - 48, 400),
    maxHeight: '85%',
    backgroundColor: Colors.card,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  counter: {
    position: 'absolute',
    top: 18,
    left: 20,
    zIndex: 10,
  },
  scrollContent: {
    maxHeight: 420,
  },
  contentContainer: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 8,
    alignItems: 'center',
  },
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  posterImage: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: Colors.background,
  },
  inlineImage: {
    width: '100%',
    height: 160,
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: Colors.background,
  },
  mediaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.primaryLight,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    marginBottom: 16,
    width: '100%',
  },
  playCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actions: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 20,
    gap: 10,
    alignItems: 'center',
  },
  okButton: {
    width: '100%',
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  dismissButton: {
    paddingVertical: 8,
  },
  bellContainer: {
    position: 'relative',
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  counterText: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  bellBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: Colors.card,
  },
});
