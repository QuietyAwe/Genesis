import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../hooks/useTheme';
import { spacing, typography } from '../constants/theme';
import * as stageDao from '../services/db/stageDao';
import * as chatDao from '../services/db/chatDao';
import * as characterDao from '../services/db/characterDao';
import * as worldDao from '../services/db/worldDao';

interface ChronicleEntry {
  id: string;
  name: string;
  messageCount: number;
  createdAt: number;
  worldNames: string[];
  characterNames: string[];
}

async function loadChronicles(): Promise<ChronicleEntry[]> {
  const stages = await stageDao.getAllStages();
  if (stages.length === 0) return [];

  const allChars = await characterDao.getAllCharacters();
  const charMap = new Map(allChars.map((c) => [c.id, c.name]));

  const entries: ChronicleEntry[] = [];
  for (const s of stages) {
    const msgs = await chatDao.getMessagesByStage(s.id);
    const worldNames: string[] = [];
    for (const wid of s.worldIds) {
      const w = await worldDao.getWorldById(wid);
      if (w) worldNames.push(w.name);
    }
    entries.push({
      id: s.id,
      name: s.name,
      messageCount: msgs.length,
      createdAt: s.createdAt,
      worldNames,
      characterNames: s.characterIds.map((id) => charMap.get(id) || '未知角色'),
    });
  }
  return entries;
}

export default function ChroniclesScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const [entries, setEntries] = useState<ChronicleEntry[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadChronicles().then(setEntries);
    }, []),
  );

  function formatDate(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffHours < 1) return '刚刚';
    if (diffHours < 24) return `${diffHours} 小时前`;
    if (diffDays < 7) return `${diffDays} 天前`;
    return d.toLocaleDateString('zh-CN');
  }

  const handleOpenStage = async (stageId: string) => {
    const { useStageStore } = await import('../stores/useStageStore');
    await useStageStore.getState().selectStage(stageId);
    (navigation as any).navigate('Tabs', { screen: 'Stage' });
  };

  const handleDeleteStage = (stageId: string, stageName: string) => {
    Alert.alert('删除剧本', `确定删除「${stageName}」吗？此操作将同时删除所有对话记录，且无法恢复。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          console.log(`[Chronicles] Deleting stage: ${stageName} (${stageId})`);
          await stageDao.deleteStage(stageId);
          loadChronicles().then(setEntries);
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.heading, { color: colors.text.primary }]}>历史</Text>

      {entries.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>尚无记录</Text>
          <Text style={[styles.emptyHint, { color: colors.text.tertiary }]}>完成一场推演后，剧本将会出现在这里。</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {entries.map((entry) => (
            <TouchableOpacity
              key={entry.id}
              style={[styles.card, { backgroundColor: colors.surface }]}
              onPress={() => handleOpenStage(entry.id)}
              onLongPress={() => handleDeleteStage(entry.id, entry.name)}
              activeOpacity={0.7}
            >
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, { color: colors.text.primary }]}>{entry.name}</Text>
                <Text style={[styles.cardDate, { color: colors.text.tertiary }]}>{formatDate(entry.createdAt)}</Text>
              </View>
              <View style={styles.cardMeta}>
                <Text style={[styles.metaText, { color: colors.text.secondary }]}>
                  {entry.messageCount} 条消息
                </Text>
                {entry.worldNames.length > 0 && (
                  <Text style={[styles.metaText, { color: colors.text.secondary }]}>世界：{entry.worldNames.join('、')}</Text>
                )}
              </View>
              <View style={styles.charTags}>
                {entry.characterNames.map((name) => (
                  <View key={name} style={[styles.charTag, { backgroundColor: colors.accent }]}>
                    <Text style={[styles.charTagText, { color: colors.text.secondary }]}>{name}</Text>
                  </View>
                ))}
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
  },
  heading: {
    ...typography.heading,
    marginBottom: spacing.lg,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    ...typography.subheading,
    textAlign: 'center',
  },
  emptyHint: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  card: {
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  cardTitle: {
    ...typography.subheading,
    flex: 1,
  },
  cardDate: {
    ...typography.caption,
  },
  cardMeta: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  metaText: {
    ...typography.caption,
  },
  charTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  charTag: {
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  charTagText: {
    ...typography.caption,
    fontWeight: '500',
  },
});
