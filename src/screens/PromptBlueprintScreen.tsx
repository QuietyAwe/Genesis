import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useArchiveStore } from '../stores/useArchiveStore';
import { assembleSystemPrompt, AVAILABLE_VARIABLES, DEFAULT_SYSTEM_PROMPT, DEFAULT_TEMPLATE_WITH_VARS } from '../services/api/promptAssembler';
import { useTheme } from '../hooks/useTheme';
import { colors, spacing, typography } from '../constants/theme';

export default function PromptBlueprintScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const customTemplate = useSettingsStore((s) => s.customPromptTemplate);
  const setCustomTemplate = useSettingsStore((s) => s.setCustomPromptTemplate);

  const [text, setText] = useState(customTemplate || '');
  const [preview, setPreview] = useState('');

  const characters = useArchiveStore((s) => s.characters);
  const worlds = useArchiveStore((s) => s.worlds);

  function handlePreview() {
    const previewPrompt = assembleSystemPrompt({
      characters: characters.slice(0, 3),
      worldLore: worlds[0]?.lore,
      speakerId: characters[0]?.id,
      lastSpeakerName: characters[1]?.name,
    }, text || undefined);
    setPreview(previewPrompt);
  }

  function handleSave() {
    setCustomTemplate(text.trim() || null);
    (navigation as any).goBack();
  }

  function insertVariable(tag: string) {
    setText((prev) => prev + ` ${tag} `);
  }

  function handleReset() {
    Alert.alert('重置蓝图', '确定要恢复默认提示词模板吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '重置',
        style: 'destructive',
        onPress: () => setText(''),
      },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => (navigation as any).goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.title}>提示词蓝图</Text>
        <TouchableOpacity onPress={handleSave} style={styles.saveBtn}>
          <Text style={styles.saveBtnText}>保存</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.hint}>
        编辑系统 Prompt 模板。使用变量标签在运行时动态注入内容。留空使用默认模板。
      </Text>

      {/* Fill default + variable reference */}
      <View style={styles.templateActions}>
        <TouchableOpacity style={styles.fillDefaultBtn} onPress={() => setText(DEFAULT_TEMPLATE_WITH_VARS)}>
          <Text style={styles.fillDefaultText}>填入默认模板</Text>
        </TouchableOpacity>
        <View style={styles.variableRef}>
          <Text style={styles.variableRefLabel}>变量说明：</Text>
          {AVAILABLE_VARIABLES.map((v) => (
            <TouchableOpacity key={v.tag} onPress={() => insertVariable(v.tag)}>
              <Text style={styles.variableRefItem}>  {v.label} → <Text style={styles.variableRefTag}>{v.tag}</Text>
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Variable Tags */}
      <View style={styles.tagsContainer}>
        {AVAILABLE_VARIABLES.map((v) => (
          <TouchableOpacity
            key={v.tag}
            style={styles.tag}
            onPress={() => insertVariable(v.tag)}
          >
            <Text style={styles.tagText}>{v.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Template Editor */}
      <TextInput
        style={styles.editor}
        value={text}
        onChangeText={setText}
        placeholder="留空使用默认模板。输入自定义 Prompt，用 {{variable}} 插入变量..."
        placeholderTextColor={colors.text.tertiary}
        multiline
        textAlignVertical="top"
      />

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.previewBtn} onPress={handlePreview}>
          <Text style={styles.previewBtnText}>预览拼接结果</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
          <Text style={styles.resetBtnText}>恢复默认</Text>
        </TouchableOpacity>
      </View>

      {/* Preview */}
      {preview ? (
        <View style={styles.previewContainer}>
          <Text style={styles.previewLabel}>拼接预览：</Text>
          <Text style={styles.previewText}>{preview}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  backBtn: {
    padding: spacing.xs,
  },
  backText: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  title: {
    ...typography.subheading,
    color: colors.text.primary,
    fontWeight: '600',
  },
  saveBtn: {
    padding: spacing.xs,
  },
  saveBtnText: {
    ...typography.caption,
    color: colors.text.primary,
    fontWeight: '500',
  },
  hint: {
    ...typography.caption,
    color: colors.text.tertiary,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  tag: {
    backgroundColor: colors.accent,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  tagText: {
    ...typography.caption,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  editor: {
    ...typography.body,
    color: colors.text.primary,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: 8,
    padding: spacing.md,
    minHeight: 200,
    textAlignVertical: 'top',
    marginBottom: spacing.md,
  },
  templateActions: {
    marginBottom: spacing.sm,
  },
  fillDefaultBtn: {
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  fillDefaultText: {
    ...typography.caption,
    color: colors.text.primary,
    fontWeight: '500',
  },
  variableRef: {
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
  },
  variableRefLabel: {
    ...typography.caption,
    color: colors.text.tertiary,
    marginBottom: spacing.xs,
  },
  variableRefItem: {
    ...typography.caption,
    color: colors.text.secondary,
    lineHeight: 22,
  },
  variableRefTag: {
    color: colors.text.tertiary,
    fontFamily: 'monospace',
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  previewBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 8,
  },
  previewBtnText: {
    ...typography.caption,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  resetBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  resetBtnText: {
    ...typography.caption,
    color: colors.text.tertiary,
  },
  previewContainer: {
    marginBottom: spacing.lg,
  },
  previewLabel: {
    ...typography.subheading,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
  },
  previewText: {
    ...typography.body,
    color: colors.text.secondary,
    lineHeight: 24,
  },
});
