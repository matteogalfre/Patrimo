/**
 * Feuille qui monte du bas de l'écran : arrivée avec un léger ressort, fond
 * assombri en fondu, fermeture en la tirant vers le bas ou en touchant le
 * fond. Remplace les fenêtres centrées, plus proches d'un site web que d'une
 * app mobile.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View, Dimensions, KeyboardAvoidingView } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../theme/theme';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SPRING = { damping: 24, stiffness: 260, mass: 0.9 };
const DISMISS_DISTANCE = 90;
const DISMISS_VELOCITY = 900;

const BottomSheet = ({ visible, onClose, closeOnBackdrop = true, avoidKeyboard = false, children, style }) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const backdrop = useSharedValue(0);

  const unmount = useCallback(() => setMounted(false), []);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.value = withSpring(0, SPRING);
      backdrop.value = withTiming(1, { duration: 220 });
    } else if (mounted) {
      backdrop.value = withTiming(0, { duration: 180 });
      translateY.value = withTiming(SCREEN_HEIGHT, { duration: 220 }, (finished) => {
        if (finished) runOnJS(unmount)();
      });
    }
    // `mounted` ne doit pas relancer l'animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const requestClose = useCallback(() => onClose?.(), [onClose]);

  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .onUpdate((e) => {
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) runOnJS(requestClose)();
      else translateY.value = withSpring(0, SPRING);
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={requestClose}>
      <GestureHandlerRootView style={styles.root}>
        {/* Feuille avec un champ : elle remonte au-dessus du clavier. */}
        <KeyboardAvoidingView style={styles.root} behavior="padding" enabled={avoidKeyboard}>
          <Animated.View style={[styles.backdrop, backdropStyle]}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={closeOnBackdrop ? requestClose : undefined}
              accessibilityRole="button"
              accessibilityLabel="close"
            />
          </Animated.View>
          <Animated.View
            style={[
              styles.sheet,
              { backgroundColor: theme.colors.surface, paddingBottom: Math.max(insets.bottom, 16) + 8 },
              sheetStyle,
              style,
            ]}
          >
            <GestureDetector gesture={pan}>
              <View style={styles.handleZone}>
                <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />
              </View>
            </GestureDetector>
            {children}
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    maxHeight: '90%',
  },
  handleZone: { alignItems: 'center', paddingTop: 10, paddingBottom: 14 },
  handle: { width: 40, height: 5, borderRadius: 3 },
});

export default BottomSheet;
