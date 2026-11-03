/**
 * Feuille de saisie courte : un titre, un texte, un ou deux champs et un
 * bouton. `onSubmit` reçoit les valeurs et peut renvoyer un message d'erreur
 * (la feuille reste alors ouverte).
 */

import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';

import { useTheme } from '../../theme/theme';
import BottomSheet from './BottomSheet';

const InputSheet = ({
  visible,
  onClose,
  title,
  message,
  fields = [],
  initialValues = {},
  confirmText,
  onSubmit,
  secondaryText,
  onSecondary,
}) => {
  const theme = useTheme();
  const [values, setValues] = useState(initialValues);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setValues(initialValues);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const err = await onSubmit?.(values);
      if (err) setError(err);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} avoidKeyboard>
      <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
      {!!message && <Text style={[styles.message, { color: theme.colors.textSecondary }]}>{message}</Text>}
      {fields.map((f, i) => (
        <View key={f.key} style={styles.field}>
          {!!f.label && <Text style={[styles.label, { color: theme.colors.text }]}>{f.label}</Text>}
          <View style={[styles.inputRow, { borderColor: error ? theme.colors.error : theme.colors.border, backgroundColor: theme.colors.background }]}>
            <TextInput
              value={values[f.key] ?? ''}
              onChangeText={(v) => {
                setValues((prev) => ({ ...prev, [f.key]: v }));
                if (error) setError(null);
              }}
              placeholder={f.placeholder}
              placeholderTextColor={theme.colors.textTertiary}
              secureTextEntry={!!f.secure}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType={f.keyboardType || 'default'}
              autoFocus={i === 0}
              returnKeyType={i === fields.length - 1 ? 'done' : 'next'}
              onSubmitEditing={i === fields.length - 1 ? submit : undefined}
              style={[styles.input, { color: theme.colors.text }]}
              accessibilityLabel={f.label || title}
            />
            {!!f.suffix && <Text style={[styles.suffix, { color: theme.colors.textTertiary }]}>{f.suffix}</Text>}
          </View>
        </View>
      ))}
      {!!error && <Text style={[styles.error, { color: theme.colors.error }]}>{error}</Text>}
      <View style={styles.actions}>
        {!!secondaryText && (
          <TouchableOpacity onPress={onSecondary} style={styles.secondary} accessibilityRole="button">
            <Text style={[styles.secondaryText, { color: theme.colors.error }]}>{secondaryText}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={submit}
          style={[styles.primary, { backgroundColor: theme.colors.primary }]}
          accessibilityRole="button"
          disabled={busy}
        >
          {busy
            ? <ActivityIndicator color={theme.colors.onPrimary} />
            : <Text style={[styles.primaryText, { color: theme.colors.onPrimary }]}>{confirmText}</Text>}
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '700' },
  message: { fontSize: 14, lineHeight: 20, marginTop: 6 },
  field: { marginTop: 14 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingRight: 12 },
  input: { flex: 1, fontSize: 16, paddingHorizontal: 14, paddingVertical: 12 },
  suffix: { fontSize: 14, fontWeight: '600' },
  error: { fontSize: 13, marginTop: 10 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 20 },
  secondary: { paddingHorizontal: 14, paddingVertical: 12 },
  secondaryText: { fontSize: 15, fontWeight: '600' },
  primary: { borderRadius: 12, paddingHorizontal: 22, paddingVertical: 12, minWidth: 110, alignItems: 'center' },
  primaryText: { fontSize: 15, fontWeight: '700' },
});

export default InputSheet;
