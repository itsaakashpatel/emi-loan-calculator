import type Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Tabs } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconGlyph, Label } from '../../src/components/primitives';
import { useTheme } from '../../src/theme/ThemeProvider';

const TABS: ReadonlyArray<{
  name: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
}> = [
  { name: 'index', label: 'Home', icon: 'home-outline', activeIcon: 'home' },
  { name: 'banking', label: 'Banking', icon: 'business-outline', activeIcon: 'business' },
  { name: 'sip', label: 'SIP', icon: 'leaf-outline', activeIcon: 'leaf' },
  { name: 'portfolio', label: 'Portfolio', icon: 'briefcase-outline', activeIcon: 'briefcase' },
  { name: 'settings', label: 'Setting', icon: 'settings-outline', activeIcon: 'settings' },
];

/**
 * The slice of react-navigation's tab-bar props this bar actually uses. Typed locally because
 * `@react-navigation/bottom-tabs` is not a direct dependency — expo-router re-exports the runtime
 * but not the types.
 */
interface TabBarProps {
  state: { index: number; routes: Array<{ key: string; name: string }> };
  navigation: { navigate: (name: string) => void };
}

/**
 * Floating pill tab bar: a rounded, elevated bar inset from the screen edges with a soft highlight
 * behind the selected tab, rather than the default full-width bar.
 */
function FloatingTabBar({ state, navigation }: TabBarProps) {
  const { colors, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.barWrap,
        { paddingBottom: Math.max(insets.bottom, spacing.sm), paddingHorizontal: spacing.lg },
      ]}
      pointerEvents="box-none"
    >
      <View
        style={[
          styles.bar,
          { backgroundColor: colors.tabBar, borderRadius: radius.pill, borderColor: colors.border },
          styles.shadow,
        ]}
      >
        {state.routes.map((route, index) => {
          const meta = TABS.find((tab) => tab.name === route.name);
          if (!meta) return null;
          const focused = state.index === index;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={meta.label}
              onPress={() => {
                if (!focused) void Haptics.selectionAsync();
                navigation.navigate(route.name);
              }}
              style={styles.item}
            >
              <View
                style={[
                  styles.itemInner,
                  {
                    backgroundColor: focused ? colors.tabActive : 'transparent',
                    borderRadius: radius.pill,
                  },
                ]}
              >
                <IconGlyph
                  name={focused ? meta.activeIcon : meta.icon}
                  size={22}
                  color={focused ? colors.accent : colors.textMuted}
                />
                <Label
                  size="micro"
                  weight={focused ? 'semibold' : 'medium'}
                  numberOfLines={1}
                  style={{ color: focused ? colors.accent : colors.textMuted }}
                >
                  {meta.label}
                </Label>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: styles.transparent }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.label }} />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  barWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  item: { flex: 1 },
  itemInner: { alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 7 },
  // Each screen paints its own gradient, so the tab scene must not cover it.
  transparent: { backgroundColor: 'transparent' },
  shadow: {
    shadowColor: '#1B3A50',
    shadowOpacity: 0.13,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
  },
});
