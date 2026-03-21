import React from 'react';
import { Stack } from 'expo-router';
import Colors from '@/constants/colors';

export default function HomeLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.textPrimary,
        headerShadowVisible: false,
        headerBackTitle: '',
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="exercise" options={{ headerShown: false }} />
    </Stack>
  );
}
