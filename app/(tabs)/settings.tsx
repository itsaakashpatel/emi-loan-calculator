import Constants from 'expo-constants';
import { Alert, StyleSheet, Switch, View } from 'react-native';

import { LargeTitleHeader } from '../../src/components/Header';
import { Screen } from '../../src/components/Screen';
import { NumberField, SegmentedControl, TimeField } from '../../src/components/inputs';
import { Button, Card, IconGlyph, Label, ListRow } from '../../src/components/primitives';
import { canLock, unlock } from '../../src/app-lock';
import { pickBackup, restoreBackup, shareBackup } from '../../src/backup';
import { resetDatabase } from '../../src/db/client';
import { BackupError, describeBackup } from '../../src/lib/backup';
import { COMPOUNDING_LABELS, type Compounding } from '../../src/lib/finance/deposits';
import { useCalculatorStore } from '../../src/store/calculator';
import { useLoansStore } from '../../src/store/loans';
import { useSettingsStore, type ThemePreference } from '../../src/store/settings';
import { useTheme } from '../../src/theme/ThemeProvider';

const FD_COMPOUNDING: Compounding[] = ['monthly', 'quarterly', 'halfyearly', 'yearly'];

export default function SettingsScreen() {
  const { colors, spacing } = useTheme();

  const themePreference = useSettingsStore((s) => s.themePreference);
  const setThemePreference = useSettingsStore((s) => s.setThemePreference);
  const defaultRate = useSettingsStore((s) => s.defaultRate);
  const setDefaultRate = useSettingsStore((s) => s.setDefaultRate);
  const defaultTenureYears = useSettingsStore((s) => s.defaultTenureYears);
  const setDefaultTenureYears = useSettingsStore((s) => s.setDefaultTenureYears);
  const defaultFdCompounding = useSettingsStore((s) => s.defaultFdCompounding);
  const setDefaultFdCompounding = useSettingsStore((s) => s.setDefaultFdCompounding);
  const notificationTime = useSettingsStore((s) => s.notificationTime);
  const setNotificationTime = useSettingsStore((s) => s.setNotificationTime);

  const appLock = useSettingsStore((s) => s.appLock);
  const setAppLock = useSettingsStore((s) => s.setAppLock);

  const loanCount = useLoansStore((s) => s.items.length);
  const refreshLoans = useLoansStore((s) => s.refresh);

  const confirmClear = () =>
    Alert.alert(
      'Delete all saved data?',
      'Every saved loan and payment record will be removed. Your settings are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await resetDatabase();
                await refreshLoans();
                Alert.alert('Done', 'All saved loans and payment history have been deleted.');
              } catch (error) {
                Alert.alert('Could not clear', error instanceof Error ? error.message : 'Unknown error.');
              }
            })();
          },
        },
      ],
    );

  const toggleLock = (next: boolean) => {
    void (async () => {
      if (!next) {
        setAppLock(false);
        return;
      }
      if (!(await canLock())) {
        Alert.alert('Set up Face ID first', 'Turn on Face ID or a passcode in the iPhone Settings app, then try again.');
        return;
      }
      // Ask once now, so the user knows the lock works before it can shut them out.
      if (await unlock('Turn on the app lock')) setAppLock(true);
    })();
  };

  const showError = (title: string, error: unknown) =>
    Alert.alert(title, error instanceof BackupError ? error.message : 'Something went wrong. Try again.');

  const backUp = () => {
    void shareBackup().catch((error: unknown) => showError('Could not make the backup', error));
  };

  const restore = () => {
    void (async () => {
      try {
        const backup = await pickBackup();
        if (!backup) return;
        Alert.alert(
          'Replace your data with this backup?',
          `The backup has ${describeBackup(backup)}. Your ${loanCount} saved loan${loanCount === 1 ? '' : 's'} and their payments on this phone will be replaced.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Replace',
              style: 'destructive',
              onPress: () => {
                void (async () => {
                  try {
                    await restoreBackup(backup);
                    await useSettingsStore.getState().hydrate();
                    await refreshLoans();
                    Alert.alert('Restored', `Your data now matches the backup: ${describeBackup(backup)}.`);
                  } catch (error) {
                    showError('Could not restore', error);
                  }
                })();
              },
            },
          ],
        );
      } catch (error) {
        showError('Could not open the backup', error);
      }
    })();
  };

  return (
    <Screen floatingTabBar>
      <LargeTitleHeader title="Setting" />
      <Card title="Appearance">
        <SegmentedControl<ThemePreference>
          segments={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          value={themePreference}
          onChange={setThemePreference}
        />
      </Card>

      <Card title="EMI reminders">
        <TimeField
          label="Reminder time"
          value={notificationTime}
          onChange={setNotificationTime}
          hint="You get reminders three days before an EMI is due, and one after if it is unpaid."
        />
      </Card>

      <Card title="Privacy" padded={false}>
        <ListRow
          title="Lock with Face ID"
          subtitle="Ask for Face ID or your passcode when the app opens"
          icon="lock-closed-outline"
          right={
            <Switch
              value={appLock}
              onValueChange={toggleLock}
              trackColor={{ true: colors.accent }}
              accessibilityLabel="Lock with Face ID"
            />
          }
          last
        />
      </Card>

      <Card title="Calculator defaults">
        <NumberField
          label="Default interest rate"
          value={defaultRate}
          onChange={setDefaultRate}
          suffix="% p.a."
          decimals={2}
          min={0}
          max={60}
        />
        <NumberField
          label="Default tenure"
          value={defaultTenureYears}
          onChange={setDefaultTenureYears}
          suffix="yr"
          min={1}
          max={40}
        />
        <SegmentedControl<Compounding>
          label="Default FD compounding"
          segments={FD_COMPOUNDING.map((value) => ({ value, label: COMPOUNDING_LABELS[value].split('-')[0]! }))}
          value={defaultFdCompounding}
          onChange={setDefaultFdCompounding}
        />
        <Button
          label="Apply defaults to the calculator now"
          variant="secondary"
          icon="refresh-outline"
          onPress={() =>
            useCalculatorStore
              .getState()
              .seedDefaults({ annualRate: defaultRate, tenureYears: defaultTenureYears })
          }
        />
      </Card>

      <Card title="Data" padded={false}>
        <ListRow
          title="Saved loans"
          value={String(loanCount)}
          icon="wallet-outline"
        />
        <ListRow title="Storage" value="On this device" icon="phone-portrait-outline" />
        <ListRow
          title="Back up to a file"
          subtitle="Save your loans and payments to Files or iCloud Drive"
          icon="cloud-upload-outline"
          onPress={backUp}
        />
        <ListRow
          title="Restore from a backup"
          subtitle="Replace the data on this phone with a backup file"
          icon="cloud-download-outline"
          onPress={restore}
          last
        />
      </Card>

      <Button label="Delete all saved data" variant="danger" icon="trash-outline" onPress={confirmClear} />

      <View style={[styles.about, { marginTop: spacing.xl }]}>
        <IconGlyph name="calculator-outline" size={26} color={colors.textFaint} />
        <Label size="caption" tone="muted" align="center" style={{ marginTop: spacing.sm }}>
          EMI Calculator & Loan Manager
        </Label>
        <Label size="micro" tone="faint" align="center">
          Version {Constants.expoConfig?.version ?? '1.0.0'}
        </Label>
        <Label size="micro" tone="faint" align="center" style={{ marginTop: spacing.md, maxWidth: 300 }}>
          Results are indicative. Your lender's schedule may differ slightly because of day-count
          conventions and rounding. Tax figures follow the law for FY 2025-26 and are a guide only.
        </Label>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  about: { alignItems: 'center' },
});
