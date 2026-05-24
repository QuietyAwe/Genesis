import React, { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useArchiveStore } from '../stores/useArchiveStore';
import { useStageStore } from '../stores/useStageStore';
import { useTheme } from '../hooks/useTheme';
import { Character, World } from '../types';
import { spacing, typography } from '../constants/theme';
import * as stageDao from '../services/db/stageDao';

export default function StageSetupScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const route = useRoute<any>();
  const editStageId = route.params?.stageId as string | undefined;

  const archiveChars = useArchiveStore((s) => s.characters);
  const archiveWorlds = useArchiveStore((s) => s.worlds);

  const [stageName, setStageName] = useState('');
  const [selectedWorldIds, setSelectedWorldIds] = useState<string[]>([]);
  const [selectedCharIds, setSelectedCharIds] = useState<string[]>([]);

  const loadEditStage = async (id: string) => {
    const stages = await stageDao.getAllStages();
    const stage = stages.find((s) => s.id === id);
    if (!stage) return;
    setStageName(stage.name);
    setSelectedWorldIds(stage.worldIds || []);
    setSelectedCharIds(stage.characterIds);
  };

  useEffect(() => {
    useArchiveStore.getState().load();
    if (editStageId) {
      loadEditStage(editStageId);
    }
  }, [editStageId]);

  const toggleChar = (charId: string) => {
    setSelectedCharIds((prev) =>
      prev.includes(charId) ? prev.filter((id) => id !== charId) : [...prev, charId],
    );
  };

  const toggleWorld = (worldId: string) => {
    setSelectedWorldIds((prev) =>
      prev.includes(worldId) ? prev.filter((id) => id !== worldId) : [...prev, worldId],
    );
  };

  const handleCreate = async () => {
    if (!stageName.trim()) {
      Alert.alert('提示', '请输入舞台名称');
      return;
    }
    if (selectedCharIds.length === 0) {
      Alert.alert('提示', '请至少选择一个角色');
      return;
    }

    try {
      if (editStageId) {
        await stageDao.updateStage(editStageId, {
          name: stageName.trim(),
          worldIds: selectedWorldIds,
          characterIds: selectedCharIds,
          updatedAt: Date.now(),
        });
        await useStageStore.getState().loadStage(editStageId);
        Alert.alert('成功', '舞台已更新');
      } else {
        await useStageStore.getState().createStage(stageName.trim(), selectedCharIds, selectedWorldIds.length > 0 ? selectedWorldIds : undefined);
        Alert.alert('成功', '舞台已创建');
      }
      (navigation as any).navigate('Tabs', { screen: 'Stage' });
    } catch (e) {
      console.error('[StageSetup] Failed to save stage:', e);
      Alert.alert('错误', '保存舞台失败');
    }
  };

  const renderCharItem = ({ item }: { item: Character }) => {
    const isSelected = selectedCharIds.includes(item.id);
    const isImage = (item.avatar || '').startsWith('file://') || (item.avatar || '').startsWith('data:') || (item.avatar || '').startsWith('http');
    return (
      <TouchableOpacity
        key={item.id}
        style={[
          styles.charCard,
          { borderColor: colors.separator, backgroundColor: colors.surface },
          isSelected && { borderColor: colors.text.primary, backgroundColor: colors.surface },
        ]}
        onPress={() => toggleChar(item.id)}
      >
        <View style={styles.charCardHeader}>
          {isImage ? (
            <Image source={{ uri: item.avatar }} style={styles.charAvatarImage} />
          ) : (
            <Text style={styles.charAvatar}>{item.avatar}</Text>
          )}
          <Text style={[styles.charName, { color: colors.text.primary }]}>{item.name}</Text>
          {isSelected && <Text style={[styles.checkmark, { color: colors.text.primary }]}>✓</Text>}
        </View>
        {item.coreSetting ? (
          <Text numberOfLines={2} style={[styles.charSetting, { color: colors.text.secondary }]}>{item.coreSetting}</Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => (navigation as any).goBack()}>
          <Text style={[styles.backText, { color: colors.text.secondary }]}>‹ 返回</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>{editStageId ? '编辑舞台' : '新建舞台'}</Text>
        <TouchableOpacity onPress={handleCreate}>
          <Text style={[styles.saveText, { color: colors.text.primary }]}>保存</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={archiveChars}
        keyExtractor={(item) => item.id}
        renderItem={renderCharItem}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            <Text style={[styles.label, { color: colors.text.tertiary }]}>舞台名称</Text>
            <TextInput
              style={[styles.nameInput, { color: colors.text.primary, borderColor: colors.separator }]}
              value={stageName}
              onChangeText={setStageName}
              placeholder="例如：第一幕、迷雾之夜..."
              placeholderTextColor={colors.text.tertiary}
            />

            {archiveWorlds.length > 0 && (
              <>
                <Text style={[styles.label, { color: colors.text.tertiary }]}>关联世界观（可多选）</Text>
                {archiveWorlds.map((w: World) => {
                  const isSelected = selectedWorldIds.includes(w.id);
                  return (
                    <TouchableOpacity
                      key={w.id}
                      style={[
                        styles.worldChip,
                        { borderColor: colors.separator, backgroundColor: colors.surface },
                        isSelected && { borderColor: colors.text.primary, backgroundColor: colors.text.primary },
                      ]}
                      onPress={() => toggleWorld(w.id)}
                    >
                      <Text style={styles.worldChipEmoji}>{w.emoji}</Text>
                      <Text style={[
                        styles.worldChipName,
                        { color: colors.text.secondary },
                        isSelected && { color: '#FFFFFF' },
                      ]}>{w.name}</Text>
                      {isSelected && <Text style={[styles.worldChipCheck, { color: colors.text.primary }]}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
              </>
            )}

            <Text style={[styles.label, { color: colors.text.tertiary }]}>参与角色</Text>
            {archiveChars.length === 0 && (
              <Text style={[styles.emptyHint, { color: colors.text.tertiary }]}>暂无角色，请先去图鉴创建</Text>
            )}
          </>
        }
        ListFooterComponent={<View style={styles.bottomSpacer} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.md,
  },
  headerTitle: { ...typography.heading },
  backText: { ...typography.body },
  saveText: { ...typography.body, fontWeight: '600' },
  listContent: { paddingHorizontal: spacing.lg },
  label: { ...typography.subheading, marginBottom: spacing.sm, marginTop: spacing.lg },
  nameInput: {
    ...typography.body,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  worldChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  worldChipEmoji: { fontSize: 16 },
  worldChipName: { ...typography.caption, flex: 1 },
  worldChipCheck: { fontSize: 16, fontWeight: '600' },
  charCard: {
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
  },
  charCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  charAvatar: { fontSize: 20, marginRight: spacing.sm },
  charAvatarImage: { width: 28, height: 28, borderRadius: 14, marginRight: spacing.sm },
  charName: { ...typography.subheading, flex: 1 },
  checkmark: { fontSize: 18, fontWeight: '600' },
  charSetting: { ...typography.caption, lineHeight: 18 },
  emptyHint: { ...typography.caption, textAlign: 'center', marginTop: spacing.xl },
  bottomSpacer: { height: spacing.xxl },
});
