import React from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useArchiveStore } from '../stores/useArchiveStore';
import { useTheme } from '../hooks/useTheme';
import { spacing, typography } from '../constants/theme';

export default function ArchiveScreen() {
  const { colors, isDark } = useTheme();
  const navigation = useNavigation();
  const characters = useArchiveStore((s) => s.characters);
  const worlds = useArchiveStore((s) => s.worlds);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text.primary }]}>{'图鉴'}</Text>
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.addBtn, { borderColor: colors.separator }]}
            onPress={() => (navigation as any).navigate('CreateWorld')}
          >
            <Text style={[styles.addText, { color: colors.text.primary }]}>+ 世界</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addBtn, styles.addBtnPrimary, { backgroundColor: colors.text.primary, borderColor: colors.text.primary }]}
            onPress={() => (navigation as any).navigate('CreateCharacter')}
          >
            <Text style={[styles.addBtnPrimaryText, { color: isDark ? '#000000' : '#FFFFFF' }]}>+ 角色</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.subheading, { color: colors.text.tertiary }]}>角色</Text>
        {characters.length === 0 && (
          <Text style={[styles.empty, { color: colors.text.tertiary }]}>暂无角色，点击右上角创建</Text>
        )}
        {characters.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={[styles.card, isDark
              ? { backgroundColor: colors.surface, borderLeftColor: c.ambientColor || colors.separator }
              : { backgroundColor: c.ambientColor || colors.surface, borderLeftWidth: 0 }]}
            onPress={() =>
              (navigation as any).navigate('CharacterDetail', { characterId: c.id })
            }
          >
            <View style={styles.cardHeader}>
              {c.avatar.startsWith('file://') || c.avatar.startsWith('data:') || c.avatar.startsWith('http') ? (
                <Image source={{ uri: c.avatar }} style={styles.cardAvatarImage} />
              ) : (
                <Text style={styles.cardAvatar}>{c.avatar}</Text>
              )}
              <Text style={[styles.cardName, { color: colors.text.primary }]}>{c.name}</Text>
            </View>
            {c.coreSetting ? (
              <Text numberOfLines={2} style={[styles.cardPersonality, { color: colors.text.secondary }]}>
                {c.coreSetting}
              </Text>
            ) : null}
          </TouchableOpacity>
        ))}

        <Text style={[styles.subheading, styles.sectionGap, { color: colors.text.tertiary }]}>世界观</Text>
        {worlds.length === 0 && (
          <Text style={[styles.empty, { color: colors.text.tertiary }]}>暂无世界观</Text>
        )}
        {worlds.map((w) => (
          <TouchableOpacity
            key={w.id}
            style={[styles.card, isDark
              ? { backgroundColor: colors.surface, borderLeftColor: w.ambientColor || colors.separator }
              : { backgroundColor: w.ambientColor || colors.surface, borderLeftWidth: 0 }]}
            onPress={() =>
              (navigation as any).navigate('WorldDetail', { worldId: w.id })
            }
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardAvatar}>{w.emoji}</Text>
              <Text style={[styles.cardName, { color: colors.text.primary }]}>{w.name}</Text>
            </View>
            {w.lore ? (
              <Text numberOfLines={2} style={[styles.cardLore, { color: colors.text.tertiary }]}>
                {w.lore}
              </Text>
            ) : null}
          </TouchableOpacity>
        ))}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.lg,
  },
  title: {
    ...typography.heading,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  addBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
  },
  addBtnPrimary: {
  },
  addText: {
    ...typography.caption,
    fontWeight: '500',
  },
  addBtnPrimaryText: {
    ...typography.caption,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  subheading: {
    ...typography.subheading,
    marginBottom: spacing.md,
  },
  sectionGap: {
    marginTop: spacing.xxl,
  },
  card: {
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderLeftWidth: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  cardAvatar: {
    fontSize: 24,
    marginRight: spacing.sm,
  },
  cardAvatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: spacing.sm,
  },
  cardName: {
    ...typography.subheading,
  },
  cardPersonality: {
    ...typography.caption,
    lineHeight: 20,
  },
  cardLore: {
    ...typography.caption,
    lineHeight: 20,
  },
  empty: {
    ...typography.caption,
    marginBottom: spacing.md,
  },
  bottomSpacer: {
    height: spacing.xxl,
  },
});
