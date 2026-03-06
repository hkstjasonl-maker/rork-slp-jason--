import React from 'react';
import { StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { Home, BarChart3, Settings, ClipboardCheck, BookOpen } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import Colors from '@/constants/colors';

export default function TabLayout() {
  const { t, patientId } = useApp();

  const pendingCountQuery = useQuery({
    queryKey: ['assessments', 'pendingCount', patientId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('questionnaire_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('patient_id', patientId!)
        .eq('status', 'pending');
      if (error) throw error;
      return count || 0;
    },
    enabled: !!patientId,
  });

  const newVideosCountQuery = useQuery({
    queryKey: ['knowledge_videos_new_count', patientId],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const { count, error } = await supabase
        .from('knowledge_video_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('patient_id', patientId!)
        .eq('is_active', true)
        .lte('start_date', today)
        .gte('end_date', today)
        .is('viewed_at', null);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!patientId,
  });

  const pendingCount = pendingCountQuery.data || 0;
  const newVideosCount = newVideosCountQuery.data || 0;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.tabBarInactive,
        tabBarStyle: {
          backgroundColor: Colors.tabBarBackground,
          borderTopColor: Colors.border,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600' as const,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t('home'),
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: t('progress'),
          tabBarIcon: ({ color, size }) => <BarChart3 size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="learn"
        options={{
          title: t('learn'),
          tabBarIcon: ({ color, size }) => <BookOpen size={size} color={color} />,
          tabBarBadge: newVideosCount > 0 ? newVideosCount : undefined,
          tabBarBadgeStyle: newVideosCount > 0 ? styles.badge : undefined,
        }}
      />
      <Tabs.Screen
        name="assessments"
        options={{
          title: t('assessments'),
          tabBarIcon: ({ color, size }) => <ClipboardCheck size={size} color={color} />,
          tabBarBadge: pendingCount > 0 ? pendingCount : undefined,
          tabBarBadgeStyle: pendingCount > 0 ? styles.badge : undefined,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('settings'),
          tabBarIcon: ({ color, size }) => <Settings size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: Colors.error,
    fontSize: 11,
    fontWeight: '700' as const,
    minWidth: 18,
    height: 18,
    lineHeight: 18,
    borderRadius: 9,
  },
});
