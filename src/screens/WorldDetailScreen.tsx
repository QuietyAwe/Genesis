import React from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, LoreEntry } from '../types';
import { useArchiveStore } from '../stores/useArchiveStore';
import { useTheme } from '../hooks/useTheme';
import { colors, spacing, typography } from '../constants/theme';
import { LoreEntryCard, LoreEntryViewer } from '../components/LoreEntryCard';

type Props = NativeStackScreenProps<RootStackParamList, 'WorldDetail'>;

export default function WorldDetailScreen({ route, navigation }: Props) {
  const { colors, isDark } = useTheme();
  const { worldId } = route.params;
  const worlds = useArchiveStore((s) => s.worlds);
  const updateWorld = useArchiveStore((s) => s.updateWorld);
  const deleteWorld = useArchiveStore((s) => s.deleteWorld);
  const world = worlds.find((w) => w.id === worldId);

  const [editing, setEditing] = React.useState(false);
  const [editName, setEditName] = React.useState(world?.name || '');
  const [editEmoji, setEditEmoji] = React.useState(world?.emoji || '');
  const [editLore, setEditLore] = React.useState(world?.lore || '');
  const [editEntries, setEditEntries] = React.useState<LoreEntry[]>(world?.loreEntries || []);

  React.useEffect(() => {
    if (world) {
      setEditName(world.name);
      setEditEmoji(world.emoji);
      setEditLore(world.lore);
      setEditEntries(world.loreEntries || []);
    }
  }, [world]);

  if (!world) {
    return (
      <View style={styles.container}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ 返回</Text>
        </TouchableOpacity>
        <Text style={styles.notFound}>世界观不存在</Text>
      </View>
    );
  }

  const handleSave = async () => {
    if (!editName.trim()) return;
    await updateWorld(world.id, {
      name: editName.trim(),
      emoji: editEmoji.trim() || world.emoji,
      lore: editLore.trim(),
      loreEntries: editEntries,
    });
    setEditing(false);
  };

  const handleDelete = () => {
    Alert.alert('删除世界观', `确定删除「${world.name}」吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await deleteWorld(world.id);
          navigation.goBack();
        },
      },
    ]);
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ 返回</Text>
        </TouchableOpacity>
        {!editing ? (
          <TouchableOpacity onPress={() => setEditing(true)} style={styles.editBtn}>
            <Text style={styles.editBtnText}>编辑</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.editActions}>
            <TouchableOpacity onPress={() => { setEditing(false); }} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} style={styles.saveBtn}>
              <Text style={styles.saveBtnText}>保存</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.hero}>
        {editing ? (
          <TextInput
            style={styles.emojiInput}
            value={editEmoji}
            onChangeText={setEditEmoji}
            placeholder="🌍"
            textAlign="center"
          />
        ) : (
          <Text style={styles.emoji}>{world.emoji}</Text>
        )}
        {editing ? (
          <TextInput
            style={styles.nameInput}
            value={editName}
            onChangeText={setEditName}
            placeholder="世界观名称"
            placeholderTextColor={colors.text.tertiary}
            textAlign="center"
          />
        ) : (
          <Text style={styles.name}>{world.name}</Text>
        )}
      </View>

      {editing ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>设定</Text>
          <TextInput
            style={styles.textArea}
            value={editLore}
            onChangeText={setEditLore}
            placeholder="描述这个世界的规则、历史、氛围…"
            placeholderTextColor={colors.text.tertiary}
            multiline
            textAlignVertical="top"
          />
        </View>
      ) : (
        <Section label="设定" value={world.lore} />
      )}

      {/* Lore Entries (世界书) */}
      {editing ? (
        <View style={styles.section}>
          <View style={styles.loreHeader}>
            <Text style={styles.sectionLabel}>世界书词条</Text>
            <TouchableOpacity
              style={styles.loreAddBtn}
              onPress={() => {
                setEditEntries((prev) => [
                  ...prev,
                  { id: `le_${Date.now()}`, isGlobal: false, keywords: [], content: '' },
                ]);
              }}
            >
              <Text style={styles.loreAddBtnText}>+ 添加</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.loreHint}>
            全局词条每次对话自动注入；关键词词条在近期消息匹配时注入。
          </Text>
          {editEntries.map((entry, idx) => (
            <LoreEntryCard
              key={entry.id}
              entry={entry}
              onUpdate={(updated) => {
                setEditEntries((prev) => prev.map((e, i) => (i === idx ? updated : e)));
              }}
              onDelete={() => {
                setEditEntries((prev) => prev.filter((_, i) => i !== idx));
              }}
            />
          ))}
        </View>
      ) : (
        <LoreEntryViewer entries={world.loreEntries || []} />
      )}

      {!editing && (
        <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
          <Text style={[styles.deleteText, { color: isDark ? '#EF4444' : '#CC4444' }]}>删除世界观</Text>
        </TouchableOpacity>
      )}

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

function Section({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <Text style={styles.sectionValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  backBtn: {
    padding: spacing.xs,
  },
  backText: {
    ...typography.body,
    color: colors.text.tertiary,
  },
  editBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  editBtnText: {
    ...typography.caption,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  editActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  cancelBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  cancelBtnText: {
    ...typography.caption,
    color: colors.text.tertiary,
  },
  saveBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  saveBtnText: {
    ...typography.caption,
    color: colors.text.primary,
    fontWeight: '600',
  },
  hero: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  emoji: {
    fontSize: 48,
  },
  emojiInput: {
    fontSize: 48,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
    marginBottom: spacing.sm,
    width: 80,
  },
  name: {
    ...typography.heading,
    color: colors.text.primary,
    marginTop: spacing.sm,
  },
  nameInput: {
    ...typography.heading,
    color: colors.text.primary,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
    paddingVertical: spacing.xs,
    width: '80%',
  },
  notFound: {
    ...typography.body,
    color: colors.text.tertiary,
    textAlign: 'center',
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.text.tertiary,
    marginBottom: spacing.sm,
  },
  sectionValue: {
    ...typography.body,
    color: colors.text.secondary,
    lineHeight: 24,
  },
  textArea: {
    ...typography.body,
    color: colors.text.primary,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: 8,
    padding: spacing.md,
    minHeight: 120,
  },
  deleteBtn: {
    marginTop: spacing.xxl,
    padding: spacing.md,
    alignItems: 'center',
  },
  deleteText: {
    ...typography.body,
    color: '#CC4444',
  },
  bottomSpacer: {
    height: spacing.xxl,
  },
  loreHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  loreAddBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  loreAddBtnText: {
    ...typography.caption,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  loreHint: {
    ...typography.caption,
    color: colors.text.tertiary,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
});
