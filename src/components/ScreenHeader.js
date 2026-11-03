/**
 * Reusable screen header.
 *
 * Every screen used to roll its own header (paddings, font sizes, back button,
 * trailing actions, …) which led to inconsistent spacing and a sprawl of
 * one-off styles. `ScreenHeader` centralises that layout while keeping the
 * three slots (`left`, `center`, `right`) opaque so callers can drop in
 * anything they need.
 *
 * Usage:
 *
 *   <ScreenHeader
 *     left={<BackButton onPress={...} />}
 *     center={<Text style={styles.title}>...</Text>}
 *     right={<SettingsButton />}
 *   />
 *
 * Convenience: pass a `title` string + optional `subtitle` to skip writing
 * the center slot manually.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { useTheme } from '../theme/theme';

const ScreenHeader = ({ left, center, right, title, subtitle, accessibilityLabel }) => {
  const theme = useTheme();

  const renderCenter = () => {
    if (center) return center;
    if (!title) return null;
    // Note: the role="header" lives on the outer container (below); we don't
    // repeat it here to avoid exposing two nested header elements to screen
    // readers when the convenience `title` prop is used.
    return (
      <View style={styles.centerSlot}>
        <Text
          style={[styles.title, { color: theme.colors.text }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[styles.subtitle, { color: theme.colors.textSecondary }]}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
    );
  };

  return (
    <View
      style={styles.container}
      accessibilityRole="header"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.sideSlot}>{left}</View>
      {renderCenter()}
      <View style={[styles.sideSlot, styles.sideSlotRight]}>{right}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    minHeight: 56,
  },
  sideSlot: {
    minWidth: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  sideSlotRight: {
    alignItems: 'flex-end',
  },
  centerSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
});

export default ScreenHeader;
