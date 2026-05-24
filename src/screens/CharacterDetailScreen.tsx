import React, { useState } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { useArchiveStore } from '../stores/useArchiveStore';
import { useTheme } from '../hooks/useTheme';
import { colors, spacing, typography } from '../constants/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'CharacterDetail'>;

function isImageUri(uri: string): boolean {
  return uri.startsWith('file://') || uri.startsWith('http://') || uri.startsWith('https://') || uri.startsWith('data:');
}

export default function CharacterDetailScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const { characterId } = route.params;
  const characters = useArchiveStore((s) => s.characters);
  const updateCharacter = useArchiveStore((s) => s.updateCharacter);
  const deleteCharacter = useArchiveStore((s) => s.deleteCharacter);
  const character = characters.find((c) => c.id === characterId);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(character?.name || '');
  const [editCoreSetting, setEditCoreSetting] = useState(character?.coreSetting || '');
  const [editAvatar, setEditAvatar] = useState(character?.avatar || '');

  // Re-sync when character changes
  React.useEffect(() => {
    if (character) {
      setEditName(character.name);
      setEditCoreSetting(character.coreSetting);
      setEditAvatar(character.avatar);
    }
  }, [character]);

  if (!character) {
    return (
      <View style={styles.container}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ 返回</Text>
        </TouchableOpacity>
        <Text style={styles.notFound}>角色不存在</Text>
      </View>
    );
  }

  const handleSave = async () => {
    if (!editName.trim()) return;
    await updateCharacter(character.id, {
      name: editName.trim(),
      coreSetting: editCoreSetting.trim(),
      avatar: editAvatar.trim() || character.avatar,
    });
    setEditing(false);
  };

  const handleDelete = () => {
    Alert.alert('删除角色', `确定删除「${character.name}」吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await deleteCharacter(character.id);
          navigation.goBack();
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
        {isImageUri(editing ? editAvatar : character.avatar) ? (
          <Image source={{ uri: editing ? editAvatar : character.avatar }} style={styles.avatarImage} />
        ) : (
          <Text style={styles.avatar}>{editing ? editAvatar : character.avatar}</Text>
        )}
        {editing ? (
          <View style={styles.editFields}>
            <TextInput
              style={styles.nameInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="角色名称"
              placeholderTextColor={colors.text.tertiary}
            />
            <TextInput
              style={styles.avatarInput}
              value={editAvatar}
              onChangeText={setEditAvatar}
              placeholder="Emoji 或图片 URI"
              placeholderTextColor={colors.text.tertiary}
            />
          </View>
        ) : (
          <Text style={styles.name}>{character.name}</Text>
        )}
      </View>

      {editing ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>核心设定</Text>
          <TextInput
            style={styles.textArea}
            value={editCoreSetting}
            onChangeText={setEditCoreSetting}
            placeholder="输入角色的性格、口癖、目标、背景等…"
            placeholderTextColor={colors.text.tertiary}
            multiline
            textAlignVertical="top"
          />
        </View>
      ) : (
        <Section label="核心设定" value={character.coreSetting} />
      )}

      {!editing && (
        <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
          <Text style={styles.deleteText}>删除角色</Text>
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
  avatar: {
    fontSize: 48,
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
    marginBottom: spacing.sm,
  },
  name: {
    ...typography.heading,
    color: colors.text.primary,
    marginTop: spacing.sm,
  },
  editFields: {
    marginTop: spacing.sm,
    width: '100%',
    alignItems: 'center',
    gap: spacing.sm,
  },
  nameInput: {
    ...typography.heading,
    color: colors.text.primary,
    textAlign: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
    paddingVertical: spacing.xs,
    width: '80%',
  },
  avatarInput: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: 'center',
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
});
