import React from 'react';
import {
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LoreEntry } from '../types';
import { useTheme } from '../hooks/useTheme';
import { colors, spacing, typography } from '../constants/theme';

export function LoreEntryCard({
  entry,
  onUpdate,
  onDelete,
}: {
  entry: LoreEntry;
  onUpdate: (e: LoreEntry) => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  const [kwInput, setKwInput] = React.useState('');

  const addKeyword = () => {
    const kw = kwInput.trim();
    if (!kw || entry.keywords.includes(kw)) return;
    onUpdate({ ...entry, keywords: [...entry.keywords, kw] });
    setKwInput('');
  };

  const removeKeyword = (kw: string) => {
    onUpdate({ ...entry, keywords: entry.keywords.filter((k) => k !== kw) });
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>全局注入</Text>
          <Switch
            value={entry.isGlobal}
            onValueChange={(v) => onUpdate({ ...entry, isGlobal: v })}
            trackColor={{ false: colors.separator, true: colors.text.secondary }}
          />
        </View>
        <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
          <Text style={styles.deleteBtnText}>删除</Text>
        </TouchableOpacity>
      </View>

      {!entry.isGlobal && (
        <View style={styles.kwSection}>
          <Text style={styles.kwLabel}>触发关键词</Text>
          <View style={styles.kwChips}>
            {entry.keywords.map((kw) => (
              <TouchableOpacity key={kw} style={styles.kwChip} onPress={() => removeKeyword(kw)}>
                <Text style={styles.kwChipText}>{kw} ×</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.kwInputRow}>
            <TextInput
              style={styles.kwInput}
              value={kwInput}
              onChangeText={setKwInput}
              placeholder="输入关键词"
              placeholderTextColor={colors.text.tertiary}
              onSubmitEditing={addKeyword}
              returnKeyType="done"
            />
            <TouchableOpacity style={styles.kwAddBtn} onPress={addKeyword}>
              <Text style={styles.kwAddBtnText}>添加</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <TextInput
        style={styles.contentInput}
        value={entry.content}
        onChangeText={(t) => onUpdate({ ...entry, content: t })}
        placeholder="词条内容：世界观设定、NPC 描述、地点信息…"
        placeholderTextColor={colors.text.tertiary}
        multiline
        textAlignVertical="top"
      />
    </View>
  );
}

export function LoreEntryViewer({ entries }: { entries: LoreEntry[] }) {
  const { colors } = useTheme();
  if (!entries || entries.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>世界书词条 ({entries.length})</Text>
      {entries.map((entry) => (
        <View key={entry.id} style={styles.viewCard}>
          <View style={styles.viewMeta}>
            <Text style={[styles.badge, entry.isGlobal && styles.badgeGlobal]}>
              {entry.isGlobal ? '全局' : '关键词'}
            </Text>
            {!entry.isGlobal && entry.keywords.length > 0 && (
              <Text style={styles.keywords}>{entry.keywords.join('、')}</Text>
            )}
          </View>
          <Text style={styles.viewContent}>{entry.content}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.xl,
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.text.tertiary,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  toggleLabel: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  deleteBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  deleteBtnText: {
    ...typography.caption,
    color: '#CC4444',
  },
  kwSection: {
    marginBottom: spacing.sm,
  },
  kwLabel: {
    ...typography.caption,
    color: colors.text.tertiary,
    marginBottom: spacing.xs,
  },
  kwChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  kwChip: {
    backgroundColor: colors.background,
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
  },
  kwChipText: {
    ...typography.caption,
    color: colors.text.secondary,
    fontSize: 12,
  },
  kwInputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  kwInput: {
    ...typography.body,
    color: colors.text.primary,
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
    paddingVertical: spacing.xs,
    fontSize: 14,
  },
  kwAddBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  kwAddBtnText: {
    ...typography.caption,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  contentInput: {
    ...typography.body,
    color: colors.text.primary,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: 6,
    padding: spacing.sm,
    minHeight: 80,
    fontSize: 14,
  },
  viewCard: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  viewMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  badge: {
    ...typography.caption,
    fontSize: 11,
    color: colors.text.tertiary,
    backgroundColor: colors.background,
    borderRadius: 4,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  badgeGlobal: {
    color: colors.text.secondary,
    fontWeight: '600',
  },
  keywords: {
    ...typography.caption,
    fontSize: 11,
    color: colors.text.tertiary,
  },
  viewContent: {
    ...typography.body,
    color: colors.text.secondary,
    fontSize: 14,
    lineHeight: 20,
  },
});
