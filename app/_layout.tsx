import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as ScreenOrientation from 'expo-screen-orientation';
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AppProvider, useApp } from "@/contexts/AppContext";
import { preloadAllSounds } from "@/utils/soundEffects";
import { ScreenProtection } from "@/components/ScreenProtection";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { NetworkErrorBanner } from "@/components/NetworkErrorBanner";
import { NotificationPopup } from "@/components/NotificationPopup";
import { useDeviceSession } from "@/hooks/useDeviceSession";
import DeviceLimitScreen from "@/components/DeviceLimitScreen";
import SessionExpiredScreen from "@/components/SessionExpiredScreen";

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="splash-ad" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="language" />
      <Stack.Screen name="consent" />
      <Stack.Screen name="terms" />
      <Stack.Screen name="code-entry" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="questionnaire" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="clinical-assessment" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="partners" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="my-submissions" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="feeding-skill-player" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="flower-yield" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="gacha-draw" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="treasure-chest" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="group-join" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="group-participant" options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }} />
      <Stack.Screen name="quiz-join" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="quiz-take" options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }} />
      <Stack.Screen name="lecture-join" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="lecture-viewer" options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }} />
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

function DeviceGate({ children }: { children: React.ReactNode }) {
  const { patientId, clearPatient } = useApp();
  const router = useRouter();
  const { status, otherDevice, useThisDevice } = useDeviceSession({
    userId: patientId,
    enabled: !!patientId,
  });

  if (patientId && status === 'limit_reached') {
    return (
      <DeviceLimitScreen
        otherDevice={otherDevice}
        onUseThisDevice={() => void useThisDevice()}
        onSignOut={async () => {
          await clearPatient();
          router.replace('/code-entry');
        }}
        busy={false}
      />
    );
  }

  if (patientId && status === 'evicted') {
    return (
      <SessionExpiredScreen
        onSignInAgain={async () => {
          await clearPatient();
          router.replace('/code-entry');
        }}
      />
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  useEffect(() => {
    void SplashScreen.hideAsync();
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    preloadAllSounds().catch(() => {});
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AppProvider>
          <NetworkErrorBanner />
          <ScreenProtection>
            <ErrorBoundary>
              <NotificationLayer>
                <DeviceGate>
                  <RootLayoutNav />
                </DeviceGate>
              </NotificationLayer>
            </ErrorBoundary>
          </ScreenProtection>
        </AppProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
