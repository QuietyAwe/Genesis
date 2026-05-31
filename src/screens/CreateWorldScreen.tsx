import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
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
import { LoreEntryCard } from '../components/LoreEntryCard';
import { deriveColorFromName, AMBIENT_SWATCHES } from '../utils/ambientColor';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateWorld'>;

export default function CreateWorldScreen({ navigation }: Props) {
  const { colors, isDark } = useTheme();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [lore, setLore] = useState('');
  const [ambientColor, setAmbientColor] = useState<string>(colors.surface);
  const [importExpanded, setImportExpanded] = useState(false);
  const [wikiText, setWikiText] = useState('');
  const [loreEntries, setLoreEntries] = useState<LoreEntry[]>([]);
  const addWorld = useArchiveStore((s) => s.addWorld);

  // Auto-derive ambient color from name
  useEffect(() => {
    if (name.trim()) {
      setAmbientColor(deriveColorFromName(name.trim()));
    }
  }, [name]);

  function parseWorldWiki(text: string): { name: string; lore: string } | null {
    // Strategy 1: First header as name, rest as lore
    const headerMatch = text.match(/#{1,3}\s+(.+?)(?:\n|$)/);
    if (headerMatch) {
      const wikiName = headerMatch[1].trim();
      const loreText = text.slice(text.indexOf(headerMatch[0]) + headerMatch[0].length).trim();
      return { name: wikiName, lore: loreText || text.slice(0, 500) };
    }
    // Strategy 2: "Name: description" pattern
    const colonMatch = text.match(/^([^:\n]{1,30})[：:\s—-]+\s*(.*)/m);
    if (colonMatch) {
      return { name: colonMatch[1].trim(), lore: (colonMatch[2] || text).trim() };
    }
    // Strategy 3: Fallback — first line as name
    const firstLine = text.split('\n').find((l) => l.trim().length > 0 && l.trim().length < 30);
    if (firstLine) {
      return { name: firstLine.trim(), lore: text.slice(text.indexOf(firstLine) + firstLine.length).trim() };
    }
    return null;
  }

  const handleImport = () => {
    if (!wikiText.trim()) return;
    const parsed = parseWorldWiki(wikiText);
    if (!parsed) {
      Alert.alert('导入失败', '未能从文本中解析出世界观信息');
      return;
    }
    setName(parsed.name);
    setLore(parsed.lore);
    setWikiText('');
    setImportExpanded(false);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    try {
      await addWorld({
        name: name.trim(),
        emoji: emoji.trim() || '🌍',
        lore: lore.trim(),
        ambientColor,
        loreEntries: loreEntries.length > 0 ? loreEntries : undefined,
      });
      Alert.alert('保存成功', `${name.trim()} 已加入图鉴`);
      navigation.goBack();
    } catch (e) {
      console.error('[CreateWorld] Save failed:', e);
      Alert.alert('保存失败', '世界观创建失败。\n\n' + (e instanceof Error ? e.message : String(e)));
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ 返回</Text>
        </TouchableOpacity>
        <Text style={styles.title}>新世界</Text>
        <TouchableOpacity
          onPress={handleSave}
          style={[styles.saveBtn, !name.trim() && styles.saveBtnDisabled]}
          disabled={!name.trim()}
        >
          <Text style={styles.saveText}>保存</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.form} contentContainerStyle={styles.formContent}>
        {/* Agentic Import */}
        <View style={styles.importSection}>
          {!importExpanded ? (
            <TouchableOpacity style={styles.importToggle} onPress={() => setImportExpanded(true)}>
              <Text style={styles.importToggleText}>📋 从 Wiki 长文本导入</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.importExpanded}>
              <Text style={styles.importLabel}>粘贴世界观 Wiki 文本</Text>
              <TextInput
                style={styles.importText}
                value={wikiText}
                onChangeText={setWikiText}
                placeholder="在此粘贴 Wiki 文本..."
                placeholderTextColor={colors.text.tertiary}
                multiline
                textAlignVertical="top"
              />
              <View style={styles.importActions}>
                <TouchableOpacity style={styles.importBtn} onPress={handleImport} disabled={!wikiText.trim()}>
                  <Text style={[styles.importBtnText, { color: isDark ? '#000000' : '#FFFFFF' }]}>解析并填入</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelImportBtn} onPress={() => { setImportExpanded(false); setWikiText(''); }}>
                  <Text style={styles.cancelImportText}>取消</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Ambient color picker */}
        <View style={styles.colorSection}>
          <Text style={styles.colorLabel}>卡片颜色</Text>
          <View style={styles.colorSwatches}>
            {AMBIENT_SWATCHES.map((swatch) => (
              <TouchableOpacity
                key={swatch}
                style={[
                  styles.colorSwatch,
                  { backgroundColor: swatch },
                  ambientColor === swatch && styles.colorSwatchSelected,
                ]}
                onPress={() => setAmbientColor(swatch)}
              >
                {ambientColor === swatch && (
                  <View style={styles.colorCheck}>
                    <Text style={styles.colorCheckMark}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.colorHint}>点击色块选择</Text>
        </View>

        <Field label="图标 (Emoji)" value={emoji} onChangeText={setEmoji} placeholder="🌍" />
        <Field label="名称" value={name} onChangeText={setName} placeholder="世界观名称" required />
        <Field label="设定" value={lore} onChangeText={setLore} placeholder="描述这个世界的规则、历史、氛围…" multiline />

        {/* Lore Entries */}
        <View style={styles.loreSection}>
          <View style={styles.loreHeader}>
            <Text style={styles.loreLabel}>世界书词条</Text>
            <TouchableOpacity
              style={styles.loreAddBtn}
              onPress={() => {
                setLoreEntries((prev) => [
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
          {loreEntries.map((entry, idx) => (
            <LoreEntryCard
              key={entry.id}
              entry={entry}
              onUpdate={(updated) => {
                setLoreEntries((prev) => prev.map((e, i) => (i === idx ? updated : e)));
              }}
              onDelete={() => {
                setLoreEntries((prev) => prev.filter((_, i) => i !== idx));
              }}
            />
          ))}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  required,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  multiline?: boolean;
  required?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.text.tertiary}
        multiline={multiline}
        textAlignVertical="top"
        blurOnSubmit={false}
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
    paddingBottom: spacing.lg,
  },
  backBtn: {
    padding: spacing.xs,
  },
  backText: {
    ...typography.body,
    color: colors.text.tertiary,
  },
  title: {
    ...typography.subheading,
    color: colors.text.primary,
  },
  saveBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  saveBtnDisabled: {
    opacity: 0.3,
  },
  saveText: {
    ...typography.body,
    color: colors.text.primary,
    fontWeight: '500',
  },
  form: {
    flex: 1,
  },
  formContent: {
    paddingHorizontal: spacing.lg,
  },
  importSection: {
    marginBottom: spacing.lg,
  },
  importToggle: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 8,
    alignItems: 'center',
  },
  importToggleText: {
    ...typography.caption,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  importExpanded: {
    marginBottom: spacing.lg,
  },
  importLabel: {
    ...typography.caption,
    color: colors.text.tertiary,
    marginBottom: spacing.sm,
  },
  importText: {
    ...typography.body,
    color: colors.text.primary,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: 8,
    padding: spacing.md,
    minHeight: 120,
    textAlignVertical: 'top',
    marginBottom: spacing.sm,
  },
  importActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  importBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.text.primary,
    borderRadius: 8,
  },
  importBtnText: {
    ...typography.caption,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  cancelImportBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  cancelImportText: {
    ...typography.caption,
    color: colors.text.tertiary,
  },
  colorSection: {
    marginBottom: spacing.xl,
  },
  colorLabel: {
    ...typography.caption,
    color: colors.text.tertiary,
    marginBottom: spacing.sm,
  },
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
  colorCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorCheckMark: {
    fontSize: 12,
    color: '#000',
  },
  colorHint: {
    ...typography.caption,
    color: colors.text.tertiary,
    textAlign: 'center',
  },
  field: {
    marginBottom: spacing.xl,
  },
  label: {
    ...typography.caption,
    color: colors.text.tertiary,
    marginBottom: spacing.sm,
  },
  required: {
    color: colors.text.secondary,
  },
  input: {
    ...typography.body,
    color: colors.text.primary,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
    paddingVertical: spacing.sm,
    fontSize: 16,
  },
  inputMultiline: {
    minHeight: 80,
  },
  loreSection: {
    marginBottom: spacing.xl,
  },
  loreHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  loreLabel: {
    ...typography.caption,
    color: colors.text.tertiary,
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
  bottomSpacer: {
    height: spacing.xxl,
  },
});
