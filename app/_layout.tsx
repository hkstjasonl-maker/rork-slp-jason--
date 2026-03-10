import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as ScreenOrientation from 'expo-screen-orientation';
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AppProvider, useApp } from "@/contexts/AppContext";
import { ScreenProtection } from "@/components/ScreenProtection";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { NetworkErrorBanner } from "@/components/NetworkErrorBanner";
import { NotificationPopup } from "@/components/NotificationPopup";

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="splash-ad" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="language" />
      <Stack.Screen name="terms" />
      <Stack.Screen name="code-entry" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="questionnaire" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="clinical-assessment" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="partners" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="my-submissions" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="feeding-skill-player" options={{ headerShown: false, presentation: 'card' }} />
    </Stack>
  );
}

function NotificationLayer({ children }: { children: React.ReactNode }) {
  const { patientId } = useApp();
  return (
    <>
      {children}
      <NotificationPopup patientId={patientId} />
    </>
  );
}

export default function RootLayout() {
  useEffect(() => {
    void SplashScreen.hideAsync();
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AppProvider>
          <NetworkErrorBanner />
          <ScreenProtection>
            <ErrorBoundary>
              <NotificationLayer>
                <RootLayoutNav />
              </NotificationLayer>
            </ErrorBoundary>
          </ScreenProtection>
        </AppProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
