import React from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { Badge, UI_COLORS } from '../ui/primitives'

/**
 * DocumentPickerCard — placeholder visual para subir un documento.
 *
 * Estado actual: emite `onPick` con un URI mock; en producción se integra
 * con `react-native-image-picker` o `expo-image-picker`.
 *
 * Estados visuales:
 *  - empty: card con dashed border + glifo + "Toca para seleccionar"
 *  - filled: muestra fileName + "Cambiar" + ícono de doc
 *  - error: borde rojo + mensaje
 */

export interface PickedDocument {
  uri: string
  name: string
  type: string
  size?: number
}

interface Props {
  label: string
  description?: string
  required?: boolean
  document: PickedDocument | null
  onPick: () => void
  onRemove?: () => void
  error?: string
  glyph?: string
}

export default function DocumentPickerCard({
  label,
  description,
  required = false,
  document,
  onPick,
  onRemove,
  error,
  glyph = '📄',
}: Props) {
  const isFilled = !!document

  return (
    <View>
      <View style={styles.labelRow}>
        <Text style={styles.label}>
          {label}{' '}
          {required && <Text style={styles.required}>*</Text>}
        </Text>
        {isFilled && <Badge label="Listo" tone="success" size="sm" />}
      </View>
      {description && <Text style={styles.description}>{description}</Text>}

      <Pressable
        onPress={onPick}
        style={({ pressed }) => [
          styles.card,
          isFilled && styles.cardFilled,
          error && styles.cardError,
          pressed && { opacity: 0.85 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${label}${isFilled ? `: ${document?.name}` : ', sin archivo seleccionado'}`}
      >
        {isFilled ? (
          <View style={styles.filledContent}>
            <Text style={styles.glyphFilled}>{glyph}</Text>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.fileName} numberOfLines={1}>
                {document.name}
              </Text>
              {document.size != null && (
                <Text style={styles.fileMeta}>
                  {(document.size / 1024).toFixed(0)} KB
                </Text>
              )}
            </View>
            <Text style={styles.changeText}>Cambiar</Text>
          </View>
        ) : (
          <View style={styles.emptyContent}>
            <Text style={styles.glyphEmpty}>{glyph}</Text>
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={styles.placeholder}>Toca para seleccionar</Text>
              <Text style={styles.subtext}>JPG, PNG o PDF · max 10 MB</Text>
            </View>
          </View>
        )}
      </Pressable>

      {error && (
        <Text style={styles.errorText} accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}

      {isFilled && onRemove && (
        <Pressable onPress={onRemove} style={styles.removeBtn} hitSlop={6}>
          <Text style={styles.removeText}>Quitar archivo</Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  label: { fontSize: 14, fontWeight: '700', color: UI_COLORS.text },
  required: { color: UI_COLORS.error },
  description: {
    fontSize: 12,
    color: UI_COLORS.muted,
    marginBottom: 8,
    lineHeight: 16,
  },
  card: {
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.card,
    minHeight: 64,
  },
  cardFilled: {
    borderStyle: 'solid',
    borderColor: UI_COLORS.success,
    backgroundColor: '#48BB7811',
  },
  cardError: { borderColor: UI_COLORS.error },
  emptyContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filledContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  glyphEmpty: { fontSize: 24, opacity: 0.55 },
  glyphFilled: { fontSize: 24 },
  placeholder: {
    fontSize: 14,
    color: UI_COLORS.muted,
    fontWeight: '600',
  },
  subtext: { fontSize: 11, color: UI_COLORS.muted, marginTop: 2 },
  fileName: { fontSize: 14, fontWeight: '700', color: UI_COLORS.text },
  fileMeta: { fontSize: 11, color: UI_COLORS.muted, marginTop: 2 },
  changeText: {
    fontSize: 12,
    color: UI_COLORS.sage,
    fontWeight: '700',
  },
  errorText: {
    fontSize: 11,
    color: UI_COLORS.error,
    marginTop: 4,
    fontWeight: '500',
  },
  removeBtn: {
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  removeText: { fontSize: 12, color: UI_COLORS.error, fontWeight: '600' },
})
