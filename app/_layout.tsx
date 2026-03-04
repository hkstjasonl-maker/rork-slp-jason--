import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AppProvider } from "@/contexts/AppContext";
import { ScreenProtection } from "@/components/ScreenProtection";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { NetworkErrorBanner } from "@/components/NetworkErrorBanner";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="language" />
      <Stack.Screen name="terms" />
      <Stack.Screen name="code-entry" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="questionnaire" options={{ headerShown: false, presentation: 'card' }} />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AppProvider>
          <NetworkErrorBanner />
          <ScreenProtection>
            <ErrorBoundary>
              <RootLayoutNav />
            </ErrorBoundary>
          </ScreenProtection>
        </AppProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
