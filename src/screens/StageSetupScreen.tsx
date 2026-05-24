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
import { Character, World } from '../types';
import { colors, spacing, typography } from '../constants/theme';
import * as stageDao from '../services/db/stageDao';

export default function StageSetupScreen() {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const editStageId = route.params?.stageId as string | undefined;

  const archiveChars = useArchiveStore((s) => s.characters);
  const archiveWorlds = useArchiveStore((s) => s.worlds);

  const [stageName, setStageName] = useState('');
  const [selectedWorldIds, setSelectedWorldIds] = useState<string[]>([]);
  const [selectedCharIds, setSelectedCharIds] = useState<string[]>([]);

  // Defined before useEffect to avoid hoisting issues with lint
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
        // Update existing stage
        await stageDao.updateStage(editStageId, {
          name: stageName.trim(),
          worldIds: selectedWorldIds,
          characterIds: selectedCharIds,
          updatedAt: Date.now(),
        });
        // Reload the stage in the store
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
        style={[styles.charCard, isSelected && styles.charCardSelected]}
        onPress={() => toggleChar(item.id)}
      >
        <View style={styles.charCardHeader}>
          {isImage ? (
            <Image source={{ uri: item.avatar }} style={styles.charAvatarImage} />
          ) : (
            <Text style={styles.charAvatar}>{item.avatar}</Text>
          )}
          <Text style={styles.charName}>{item.name}</Text>
          {isSelected && <Text style={styles.checkmark}>✓</Text>}
        </View>
        {item.coreSetting ? (
          <Text numberOfLines={2} style={styles.charSetting}>{item.coreSetting}</Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => (navigation as any).goBack()}>
          <Text style={styles.backText}>‹ 返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{editStageId ? '编辑舞台' : '新建舞台'}</Text>
        <TouchableOpacity onPress={handleCreate}>
          <Text style={styles.saveText}>保存</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={archiveChars}
        keyExtractor={(item) => item.id}
        renderItem={renderCharItem}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            {/* Stage name */}
            <Text style={styles.label}>舞台名称</Text>
            <TextInput
              style={styles.nameInput}
              value={stageName}
              onChangeText={setStageName}
              placeholder="例如：第一幕、迷雾之夜..."
              placeholderTextColor={colors.text.tertiary}
            />

            {/* World selector */}
            {archiveWorlds.length > 0 && (
              <>
                <Text style={styles.label}>关联世界观（可多选）</Text>
                {archiveWorlds.map((w: World) => {
                  const isSelected = selectedWorldIds.includes(w.id);
                  return (
                    <TouchableOpacity
                      key={w.id}
                      style={[styles.worldChip, isSelected && styles.worldChipSelected]}
                      onPress={() => toggleWorld(w.id)}
                    >
                      <Text style={styles.worldChipEmoji}>{w.emoji}</Text>
                      <Text style={[styles.worldChipName, isSelected && styles.worldChipNameSelected]}>{w.name}</Text>
                      {isSelected && <Text style={styles.worldChipCheck}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
              </>
            )}

            <Text style={styles.label}>参与角色</Text>
            {archiveChars.length === 0 && (
              <Text style={styles.emptyHint}>暂无角色，请先去图鉴创建</Text>
            )}
          </>
        }
        ListFooterComponent={<View style={styles.bottomSpacer} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    ...typography.heading,
    color: colors.text.primary,
  },
  backText: {
    ...typography.body,
    color: colors.text.secondary,
  },
  saveText: {
    ...typography.body,
    color: colors.text.primary,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: spacing.lg,
  },
  label: {
    ...typography.subheading,
    color: colors.text.tertiary,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  nameInput: {
    ...typography.body,
    color: colors.text.primary,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  worldRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  worldChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
  },
  worldChipSelected: {
    borderColor: colors.text.primary,
    backgroundColor: colors.text.primary,
  },
  worldChipEmoji: {
    fontSize: 16,
  },
  worldChipName: {
    ...typography.caption,
    color: colors.text.secondary,
    flex: 1,
  },
  worldChipNameSelected: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  worldChipCheck: {
    fontSize: 16,
    color: colors.text.primary,
    fontWeight: '600',
  },
  charCard: {
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.surface,
  },
  charCardSelected: {
    borderColor: colors.text.primary,
    backgroundColor: '#F0F0F0',
  },
  charCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  charAvatar: {
    fontSize: 20,
    marginRight: spacing.sm,
  },
  charAvatarImage: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: spacing.sm,
  },
  charName: {
    ...typography.subheading,
    color: colors.text.primary,
    flex: 1,
  },
  checkmark: {
    fontSize: 18,
    color: colors.text.primary,
    fontWeight: '600',
  },
  charSetting: {
    ...typography.caption,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  emptyHint: {
    ...typography.caption,
    color: colors.text.tertiary,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  bottomSpacer: {
    height: spacing.xxl,
  },
});
