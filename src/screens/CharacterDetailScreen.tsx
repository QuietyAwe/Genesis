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
import { AMBIENT_SWATCHES } from '../utils/ambientColor';

type Props = NativeStackScreenProps<RootStackParamList, 'CharacterDetail'>;

function isImageUri(uri: string): boolean {
  return uri.startsWith('file://') || uri.startsWith('http://') || uri.startsWith('https://') || uri.startsWith('data:');
}

export default function CharacterDetailScreen({ route, navigation }: Props) {
  const { colors, isDark } = useTheme();
  const { characterId } = route.params;
  const characters = useArchiveStore((s) => s.characters);
  const updateCharacter = useArchiveStore((s) => s.updateCharacter);
  const deleteCharacter = useArchiveStore((s) => s.deleteCharacter);
  const character = characters.find((c) => c.id === characterId);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(character?.name || '');
  const [editCoreSetting, setEditCoreSetting] = useState(character?.coreSetting || '');
  const [editAvatar, setEditAvatar] = useState(character?.avatar || '');
  const [editAmbientColor, setEditAmbientColor] = useState(character?.ambientColor || colors.surface);
  const [editActivityLevel, setEditActivityLevel] = useState(character?.activityLevel ?? 5);
  const [advancedExpanded, setAdvancedExpanded] = useState(false);

  // Form mode
  const FIELD_KEYS = ['昵称', '年龄', '身份', '外貌', '性格', '背景', '行为模式', '语言风格'] as const;
  const FORM_KEYS = ['nickname', 'age', 'identity', 'appearance', 'personality', 'background', 'behavior', 'languageStyle'] as const;
  type FormKey = typeof FORM_KEYS[number];

  const parseCoreSetting = (text: string): { fields: Record<FormKey, string>; isForm: boolean } => {
    const fields: Record<FormKey, string> = { nickname: '', age: '', identity: '', appearance: '', personality: '', background: '', behavior: '', languageStyle: '' };
    let parsedCount = 0;
    for (let i = 0; i < FIELD_KEYS.length; i++) {
      const regex = new RegExp(`【${FIELD_KEYS[i]}】([^【]*)`);
      const match = text.match(regex);
      if (match) {
        fields[FORM_KEYS[i]] = match[1].trim();
        parsedCount++;
      }
    }
    return { fields, isForm: parsedCount >= 2 };
  };

  const initialParsed = character ? parseCoreSetting(character.coreSetting) : { fields: { nickname: '', age: '', identity: '', appearance: '', personality: '', background: '', behavior: '', languageStyle: '' }, isForm: true };
  const [creationMode, setCreationMode] = useState<'form' | 'free'>(initialParsed.isForm ? 'form' : 'free');
  const [formFields, setFormFields] = useState(initialParsed.fields);
  const updateFormField = (key: FormKey, val: string) => setFormFields((prev) => ({ ...prev, [key]: val }));

  // Re-sync when character changes
  React.useEffect(() => {
    if (character) {
      setEditName(character.name);
      setEditCoreSetting(character.coreSetting);
      setEditAvatar(character.avatar);
      setEditAmbientColor(character.ambientColor || colors.surface);
      setEditActivityLevel(character.activityLevel ?? 5);
      const parsed = parseCoreSetting(character.coreSetting);
      setFormFields(parsed.fields);
      setCreationMode(parsed.isForm ? 'form' : 'free');
    }
  }, [character, colors.surface]);

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

  const assembleFormFields = (): string => {
    const LABELS = ['昵称', '年龄', '身份', '外貌', '性格', '背景', '行为模式', '语言风格'];
    const parts: string[] = [];
    for (let i = 0; i < FORM_KEYS.length; i++) {
      const val = formFields[FORM_KEYS[i]].trim();
      if (val) parts.push(`【${LABELS[i]}】${val}`);
    }
    return parts.join('\n');
  };

  const handleSave = async () => {
    if (!editName.trim()) return;
    const finalCoreSetting = creationMode === 'form' ? assembleFormFields() : editCoreSetting.trim();
    await updateCharacter(character.id, {
      name: editName.trim(),
      coreSetting: finalCoreSetting,
      avatar: editAvatar.trim() || character.avatar,
      ambientColor: editAmbientColor,
      activityLevel: editActivityLevel,
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

      <View style={[styles.hero, !editing && character.ambientColor && { borderBottomWidth: 4, borderBottomColor: character.ambientColor }]}>
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
          {/* Mode toggle */}
          <View style={styles.modeToggle}>
            <TouchableOpacity
              style={[styles.modeBtn, creationMode === 'form' && styles.modeBtnActive]}
              onPress={() => setCreationMode('form')}
            >
              <Text style={[styles.modeBtnText, creationMode === 'form' && styles.modeBtnTextActive]}>填表</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, creationMode === 'free' && styles.modeBtnActive]}
              onPress={() => setCreationMode('free')}
            >
              <Text style={[styles.modeBtnText, creationMode === 'free' && styles.modeBtnTextActive]}>自由编辑</Text>
            </TouchableOpacity>
          </View>

          {creationMode === 'form' ? (
            <View style={styles.formFields}>
              {FORM_KEYS.map((key, i) => (
                <View key={key} style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>{FIELD_KEYS[i]}</Text>
                  <TextInput
                    style={[styles.fieldInput, ['appearance', 'personality', 'background', 'behavior', 'languageStyle'].includes(key) && styles.fieldInputMultiline]}
                    value={formFields[key]}
                    onChangeText={(v) => updateFormField(key, v)}
                    placeholder={`可选…`}
                    placeholderTextColor={colors.text.tertiary}
                    multiline={['appearance', 'personality', 'background', 'behavior', 'languageStyle'].includes(key)}
                    textAlignVertical="top"
                  />
                </View>
              ))}
            </View>
          ) : (
            <>
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
            </>
          )}
        </View>
      ) : (
        <Section label="核心设定" value={character.coreSetting} />
      )}

      {/* Card color — always visible in edit mode */}
      {editing && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>卡片颜色</Text>
          <View style={styles.colorSwatches}>
            {AMBIENT_SWATCHES.map((swatch) => (
              <TouchableOpacity
                key={swatch}
                style={[
                  styles.colorSwatch,
                  { backgroundColor: swatch },
                  editAmbientColor === swatch && styles.colorSwatchSelected,
                ]}
                onPress={() => setEditAmbientColor(swatch)}
              >
                {editAmbientColor === swatch && <Text style={styles.colorCheckMark}>✓</Text>}
              </TouchableOpacity>
            ))}
            {/* Custom color swatch */}
            <TouchableOpacity
              style={[
                styles.colorSwatch,
                { backgroundColor: editAmbientColor },
                !AMBIENT_SWATCHES.includes(editAmbientColor as any) && styles.colorSwatchSelected,
              ]}
              onPress={() => setEditAmbientColor(editAmbientColor)}
            >
              {!AMBIENT_SWATCHES.includes(editAmbientColor as any) && <Text style={styles.colorCheckMark}>✓</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Advanced settings — collapsed by default in edit mode */}
      {editing && !advancedExpanded && (
        <TouchableOpacity style={styles.advancedToggle} onPress={() => setAdvancedExpanded(true)}>
          <Text style={styles.advancedToggleText}>› 高阶设定</Text>
        </TouchableOpacity>
      )}
      {editing && advancedExpanded && (
        <View style={styles.advancedSection}>
          <Text style={styles.sectionLabel}>发言积极性</Text>
          <View style={styles.activityOptions}>
            {[
              { label: '沉默寡言', value: 2 },
              { label: '普通', value: 5 },
              { label: '话痨抢答', value: 8 },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.activityChip, editActivityLevel === opt.value && styles.activityChipSelected]}
                onPress={() => setEditActivityLevel(opt.value)}
              >
                <Text style={[styles.activityChipText, editActivityLevel === opt.value && styles.activityChipTextSelected]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.advancedCollapse} onPress={() => setAdvancedExpanded(false)}>
            <Text style={styles.advancedCollapseText}>收起</Text>
          </TouchableOpacity>
        </View>
      )}

      {!editing && (
        <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
          <Text style={[styles.deleteText, { color: isDark ? '#EF4444' : '#CC4444' }]}>删除角色</Text>
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
    paddingBottom: spacing.sm,
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
  // Mode toggle
  modeToggle: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  modeBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  modeBtnActive: {
    backgroundColor: colors.text.primary,
    borderColor: colors.text.primary,
  },
  modeBtnText: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  modeBtnTextActive: {
    color: colors.background,
  },
  formFields: {
    gap: spacing.md,
  },
  fieldRow: {
    marginBottom: spacing.sm,
  },
  fieldLabel: {
    ...typography.caption,
    color: colors.text.tertiary,
    marginBottom: spacing.xs,
  },
  fieldInput: {
    ...typography.body,
    color: colors.text.primary,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
    paddingVertical: spacing.sm,
    fontSize: 16,
  },
  fieldInputMultiline: {
    minHeight: 60,
    textAlignVertical: 'top',
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
  // Color swatches
  colorSwatches: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  colorSwatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.separator,
  },
  colorSwatchSelected: {
    borderWidth: 2,
    borderColor: colors.text.primary,
  },
  colorCheckMark: {
    fontSize: 12,
    color: '#000',
  },
  // Advanced settings
  advancedToggle: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  advancedToggleText: {
    ...typography.caption,
    color: colors.text.tertiary,
  },
  advancedSection: {
    marginTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  activityOptions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  activityChip: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.separator,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  activityChipSelected: {
    borderColor: colors.text.primary,
    backgroundColor: colors.background,
  },
  activityChipText: {
    ...typography.caption,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  activityChipTextSelected: {
    color: colors.text.primary,
  },
  advancedCollapse: {
    marginTop: spacing.sm,
    alignSelf: 'center',
    paddingVertical: spacing.xs,
  },
  advancedCollapseText: {
    ...typography.caption,
    color: colors.text.tertiary,
  },
});
