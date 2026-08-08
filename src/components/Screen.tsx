import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeProvider';

interface ScreenProps {
  children?: ReactNode;
  /** Renders children in a plain View instead of a ScrollView (for screens with their own list). */
  scroll?: boolean;
  /** Pinned to the bottom, outside the scroll area. */
  footer?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  /** Extra bottom padding so content clears the floating tab bar. */
  floatingTabBar?: boolean;
}

/** Height of the floating tab bar plus its inset, so scroll content can clear it. */
export const FLOATING_TAB_BAR_SPACE = 96;

export function Screen({
  children,
  scroll = true,
  footer,
  contentStyle,
  floatingTabBar = false,
}: ScreenProps) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  const padding = {
    paddingHorizontal: spacing.lg,
    // Tab roots draw their own large title with no native header, so they own the status-bar inset.
    paddingTop: floatingTabBar ? insets.top + spacing.sm : spacing.md,
    paddingBottom: floatingTabBar ? FLOATING_TAB_BAR_SPACE : spacing.xxxl,
  };

  // The gradient backdrop is painted once by the root layout and shows through here, so the
  // header, tab scene and screen content all sit on one continuous fade.
  return (
    <View style={styles.flex}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 44}
      >
        {scroll ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[padding, contentStyle]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.flex, contentStyle]}>{children}</View>
        )}
        {footer ? (
          <View
            style={[
              styles.footer,
              {
                backgroundColor: colors.surface,
                borderTopColor: colors.border,
                paddingBottom: Math.max(insets.bottom, spacing.md),
                paddingHorizontal: spacing.lg,
                paddingTop: spacing.md,
              },
            ]}
          >
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

/** Full-screen gradient backdrop, mounted once above the navigator. */
export function GradientBackdrop() {
  const { colors } = useTheme();
  return (
    <LinearGradient
      // Sky blue at the top settling to near-white. Most of the fade happens in the first third,
      // so cards further down sit on an almost flat field.
      colors={[...colors.gradient]}
      locations={[0, 0.32, 1]}
      style={StyleSheet.absoluteFill}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth },
});
