import React, { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
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
  const { colors, isDark } = useTheme();
  const navigation = useNavigation();
  const route = useRoute<any>();
  const editStageId = route.params?.stageId as string | undefined;

  const archiveChars = useArchiveStore((s) => s.characters);
  const archiveWorlds = useArchiveStore((s) => s.worlds);

  const [stageName, setStageName] = useState('');
  const [selectedWorldIds, setSelectedWorldIds] = useState<string[]>([]);
  const [selectedCharIds, setSelectedCharIds] = useState<string[]>([]);
  const [openingScene, setOpeningScene] = useState('');
  const [characterStatuses, setCharacterStatuses] = useState<Record<string, string>>({});
  const [statusModalChar, setStatusModalChar] = useState<Character | null>(null);
  const [statusModalText, setStatusModalText] = useState('');

  const loadEditStage = async (id: string) => {
    const stages = await stageDao.getAllStages();
    const stage = stages.find((s) => s.id === id);
    if (!stage) return;
    setStageName(stage.name);
    setSelectedWorldIds(stage.worldIds || []);
    setSelectedCharIds(stage.characterIds);
    setOpeningScene(stage.openingScene || '');
    setCharacterStatuses(stage.characterStatuses || {});
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
          openingScene: openingScene.trim() || undefined,
          characterStatuses: Object.keys(characterStatuses).length > 0 ? characterStatuses : undefined,
          updatedAt: Date.now(),
        });
        await useStageStore.getState().loadStage(editStageId);
        Alert.alert('成功', '舞台已更新');
      } else {
        await useStageStore.getState().createStage(
          stageName.trim(),
          selectedCharIds,
          selectedWorldIds.length > 0 ? selectedWorldIds : undefined,
          openingScene.trim() || undefined,
          Object.keys(characterStatuses).length > 0 ? characterStatuses : undefined,
        );
        Alert.alert('成功', '舞台已创建');
      }
      (navigation as any).navigate('Tabs', { screen: 'Stage' });
    } catch (e) {
      console.error('[StageSetup] Failed to save stage:', e);
      Alert.alert('错误', '保存舞台失败');
    }
  };

  const openStatusModal = (char: Character) => {
    setStatusModalChar(char);
    setStatusModalText(characterStatuses[char.id] || '');
  };

  const confirmStatus = () => {
    if (statusModalChar) {
      setCharacterStatuses((prev) => ({
        ...prev,
        [statusModalChar.id]: statusModalText.trim(),
      }));
      setStatusModalChar(null);
    }
  };

  const selectedChars = archiveChars.filter((c) => selectedCharIds.includes(c.id));

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
                        isSelected && { color: isDark ? '#000000' : '#FFFFFF' },
                      ]}>{w.name}</Text>
                      {isSelected && <Text style={[styles.worldChipCheck, { color: colors.text.primary }]}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
              </>
            )}

            {/* Opening Scene */}
            <Text style={[styles.label, { color: colors.text.tertiary }]}>开场起幅（可选）</Text>
            <TextInput
              style={[styles.sceneInput, { color: colors.text.primary, borderColor: colors.separator, backgroundColor: isDark ? '#0A0A0A' : '#F5F5F3' }]}
              value={openingScene}
              onChangeText={setOpeningScene}
              placeholder="夜，暴风雪肆虐。酒馆的门被突然推开..."
              placeholderTextColor={colors.text.tertiary}
              multiline
              textAlignVertical="top"
            />

            {/* Green Room — character statuses */}
            {selectedChars.length > 0 && (
              <>
                <Text style={[styles.label, { color: colors.text.tertiary }]}>演员候场室</Text>
                {selectedChars.map((c) => {
                  const status = characterStatuses[c.id];
                  const isImage = (c.avatar || '').startsWith('file://') || (c.avatar || '').startsWith('data:') || (c.avatar || '').startsWith('http');
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.greenRoomCard, { borderColor: colors.separator, backgroundColor: colors.surface }]}
                      onPress={() => openStatusModal(c)}
                    >
                      <View style={styles.greenRoomHeader}>
                        {isImage ? (
                          <Image source={{ uri: c.avatar }} style={styles.greenRoomAvatarImage} />
                        ) : (
                          <Text style={styles.greenRoomAvatar}>{c.avatar}</Text>
                        )}
                        <Text style={[styles.greenRoomName, { color: colors.text.primary }]}>{c.name}</Text>
                      </View>
                      <Text style={[styles.greenRoomStatus, { color: status ? colors.text.secondary : colors.text.tertiary }]}>
                        {status ? `处境：${status}` : '状态：默认'}
                      </Text>
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

      {/* Character Status Modal */}
      <Modal visible={!!statusModalChar} transparent animationType="slide" onRequestClose={() => setStatusModalChar(null)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setStatusModalChar(null)} />
          <View style={[styles.modalContent, { backgroundColor: isDark ? '#1A1A1A' : '#FFFFFF' }]}>
            <Text style={[styles.modalTitle, { color: colors.text.primary }]}>
              设定「{statusModalChar?.name}」的入场处境
            </Text>
            <TextInput
              style={[styles.modalInput, { color: colors.text.primary, borderColor: colors.separator, backgroundColor: isDark ? '#0A0A0A' : '#F5F5F3' }]}
              value={statusModalText}
              onChangeText={setStatusModalText}
              placeholder="例如：刚从暴风雪中逃入酒馆，浑身湿透..."
              placeholderTextColor={colors.text.tertiary}
              multiline
              autoFocus
              textAlignVertical="top"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setStatusModalChar(null)}>
                <Text style={[styles.modalCancelText, { color: colors.text.secondary }]}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirmBtn, { backgroundColor: colors.text.primary }]} onPress={confirmStatus}>
                <Text style={[styles.modalConfirmText, { color: isDark ? '#000000' : '#FFFFFF' }]}>确定</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  sceneInput: {
    ...typography.body,
    fontFamily: 'monospace',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 100,
    lineHeight: 24,
  },
  greenRoomCard: {
    borderRadius: 8,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
  },
  greenRoomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  greenRoomAvatar: { fontSize: 16, marginRight: spacing.xs },
  greenRoomAvatarImage: { width: 20, height: 20, borderRadius: 10, marginRight: spacing.xs },
  greenRoomName: { ...typography.caption, fontWeight: '500' },
  greenRoomStatus: { ...typography.caption, fontSize: 12 },
  emptyHint: { ...typography.caption, textAlign: 'center', marginTop: spacing.xl },
  bottomSpacer: { height: spacing.xxl },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  modalContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  modalTitle: {
    ...typography.subheading,
    marginBottom: spacing.md,
  },
  modalInput: {
    ...typography.body,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 80,
    lineHeight: 24,
    marginBottom: spacing.lg,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
  },
  modalCancelBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  modalCancelText: { ...typography.body },
  modalConfirmBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
  },
  modalConfirmText: { ...typography.body, fontWeight: '600' },
});
