/**
 * Interrupteur visuel (le geste est porté par la ligne qui le contient).
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';

import { useTheme } from '../theme/theme';

const Toggle = ({ value }) => {
  const theme = useTheme();
  return (
    <View style={[styles.toggle, { backgroundColor: value ? theme.colors.primary : theme.colors.border }]}>
      <View style={[styles.dot, { transform: [{ translateX: value ? 20 : 2 }] }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  toggle: { width: 44, height: 26, borderRadius: 13, justifyContent: 'center' },
  dot: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFF' },
});

export default Toggle;
