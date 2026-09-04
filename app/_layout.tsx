import { DefaultTheme, Stack, ThemeProvider as NavThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BackButton } from '../src/components/Header';
import { GradientBackdrop } from '../src/components/Screen';
import { getDb } from '../src/db/client';
import { syncEmiReminders } from '../src/notifications';
import { useAuthStore } from '../src/store/auth';
import { useCalculatorStore } from '../src/store/calculator';
import { useLoansStore } from '../src/store/loans';
import { useSettingsStore } from '../src/store/settings';
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider';

void SplashScreen.preventAutoHideAsync();

/**
 * Anchors the stack on the tab bar. Without this, opening a screen directly — a deep link, a
 * notification, a cold launch into a route — leaves it as the only entry in the stack, so Back has
 * nowhere to go and react-navigation logs "The action 'GO_BACK' was not handled". With the anchor,
 * the tabs root is always beneath, so Back and the swipe gesture both work from anywhere.
 */
export const unstable_settings = { anchor: '(tabs)' };

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // Opening the database also runs migrations, so everything downstream can assume the schema.
        await getDb();
        await useSettingsStore.getState().hydrate();
        const { defaultRate, defaultTenureYears } = useSettingsStore.getState();
        useCalculatorStore.getState().seedDefaults({ annualRate: defaultRate, tenureYears: defaultTenureYears });
        await useLoansStore.getState().refresh();
        // Only restores a stored session; it opens no network connection, so
        // a signed-out or offline launch costs nothing.
        await useAuthStore.getState().hydrate();
      } finally {
        if (!cancelled) setReady(true);
        await SplashScreen.hideAsync();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ReminderSync />
        <AppStack />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/**
 * Keeps the scheduled EMI reminders in step with the saved loans and the reminder time. The store
 * items change identity on every refresh, so this effect re-runs after any loan or payment change.
 */
function ReminderSync() {
  const items = useLoansStore((s) => s.items);
  const notificationTime = useSettingsStore((s) => s.notificationTime);

  useEffect(() => {
    void syncEmiReminders(items, notificationTime);
  }, [items, notificationTime]);

  return null;
}

function AppStack() {
  const { colors, mode, fontWeight } = useTheme();

  // React Navigation paints an opaque container background by default, which would hide the
  // gradient behind every screen and header. Make it transparent instead.
  const navTheme = {
    ...DefaultTheme,
    dark: mode === 'dark',
    colors: { ...DefaultTheme.colors, background: 'transparent', card: 'transparent', text: colors.text },
  };

  return (
    <View style={styles.flex}>
      <GradientBackdrop />
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <NavThemeProvider value={navTheme}>
      <Stack
        screenOptions={{
          // Transparent chrome everywhere so the root gradient shows through unbroken.
          headerStyle: { backgroundColor: 'transparent' },
          headerTitleStyle: { color: colors.text, fontWeight: fontWeight.bold },
          headerTitleAlign: 'center',
          headerTintColor: colors.text,
          headerShadowVisible: false,
          // The stock chevron is replaced by the app's round, frosted back button.
          headerBackVisible: false,
          headerLeft: () => <BackButton />,
          // Swipe back is the primary way out; the button is the fallback. The full-screen gesture
          // lets the swipe start anywhere, though a vertical ScrollView still wins for pans that
          // begin inside it — so the left edge remains the always-reliable spot. (`gestureResponse
          // Distance` is deliberately not set: it applies to the edge recogniser only and is inert
          // once the full-screen gesture is on.)
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
          contentStyle: { backgroundColor: 'transparent' },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="loan/emi" options={{ title: 'EMI Calculator' }} />
        <Stack.Screen name="loan/quick" options={{ title: 'Quick Calculator' }} />
        <Stack.Screen name="loan/affordability" options={{ title: 'Loan Affordability' }} />
        <Stack.Screen name="loan/refinance" options={{ title: 'Loan Refinance' }} />
        <Stack.Screen name="loan/revise" options={{ title: 'Revised EMI and Tenure' }} />
        <Stack.Screen name="loans" options={{ title: 'Loan Profile' }} />
        <Stack.Screen name="emi/schedule" options={{ title: 'Amortisation Schedule' }} />
        <Stack.Screen name="emi/advanced" options={{ title: 'Advanced Options' }} />
        <Stack.Screen name="compare" options={{ title: 'Compare Loans' }} />
        <Stack.Screen name="loan/form" options={{ title: 'Loan', presentation: 'modal' }} />
        <Stack.Screen name="loan/[id]" options={{ title: 'Loan' }} />
        <Stack.Screen name="invest/[type]" options={{ title: 'Calculator' }} />
        <Stack.Screen name="tools/eligibility" options={{ title: 'Loan Eligibility' }} />
        <Stack.Screen name="portfolio/member/[id]" options={{ title: 'Holdings' }} />
        <Stack.Screen
          name="portfolio/member-form"
          options={{ title: 'Family Member', presentation: 'modal' }}
        />
        <Stack.Screen
          name="portfolio/holding-form"
          options={{ title: 'Holding', presentation: 'modal' }}
        />
        <Stack.Screen name="portfolio/cas-upload" options={{ title: 'Import Statement' }} />
        <Stack.Screen name="history" options={{ title: 'History' }} />
      </Stack>
      </NavThemeProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
