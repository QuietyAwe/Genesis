import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Paths, File, Directory } from 'expo-file-system';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { useArchiveStore } from '../stores/useArchiveStore';
import { useTheme } from '../hooks/useTheme';
import { colors, spacing, typography } from '../constants/theme';
import { streamChat, LLMConfig } from '../services/api/client';
import * as secureStore from '../services/secureStore';
import { deriveColorFromName, AMBIENT_SWATCHES } from '../utils/ambientColor';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateCharacter'>;

/**
 * Copy image from picker's temp URI to persistent app document directory.
 * Returns the new persistent URI.
 */
function copyToPersistentStorage(uri: string): string {
  const avatarDir = new Directory(Paths.document, 'avatars');
  if (!avatarDir.exists) {
    avatarDir.create({ intermediates: true });
  }

  const ext = uri.includes('.') ? uri.split('.').pop() : 'jpg';
  const destFile = new File(avatarDir, `avatar_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`);
  new File(uri).copy(destFile);
  console.log(`[CreateCharacter::Avatar] Persisted: ${destFile.uri}`);
  return destFile.uri;
}

/**
 * Lightweight local parser: splits Wiki text by section headers,
 * extracts character-like blocks (name + description pairs).
 */
function parseWikiText(text: string): Array<{ name: string; coreSetting: string }> {
  const results: Array<{ name: string; coreSetting: string }> = [];

  // Strategy 1: Split by markdown-style headers (## Name or **Name**)
  const headerSplit = text.split(/(?:^|\n)\s*#{1,3}\s+(.+?)(?:\n|$)/);
  for (let i = 1; i < headerSplit.length; i += 2) {
    const name = headerSplit[i].trim();
    const content = (headerSplit[i + 1] || '').trim().slice(0, 500);
    if (name.length > 0 && name.length < 50) {
      results.push({ name, coreSetting: content });
    }
  }

  // Strategy 2: If no headers found, try pattern "Name: description"
  if (results.length === 0) {
    const lines = text.split('\n').filter((l) => l.trim());
    let currentName = '';
    let currentDesc = '';
    for (const line of lines) {
      const match = line.match(/^[\s*-]*【?([^:\n]{1,30})】?[：:\s—-]+\s*(.*)/);
      if (match) {
        if (currentName) results.push({ name: currentName, coreSetting: currentDesc.trim() });
        currentName = match[1].trim();
        currentDesc = match[2].trim();
      } else if (currentName) {
        currentDesc += '\n' + line;
      }
    }
    if (currentName) results.push({ name: currentName, coreSetting: currentDesc.trim() });
  }

  // Strategy 3: Fallback — treat each non-empty line as a potential character
  if (results.length === 0) {
    const lines = text.split('\n').filter((l) => l.trim().length > 2);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length < 100) {
        results.push({ name: trimmed, coreSetting: '' });
      }
    }
  }

  return results.slice(0, 20);
}

export default function CreateCharacterScreen({ navigation }: Props) {
  const { colors, isDark } = useTheme();
  const [name, setName] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [coreSetting, setCoreSetting] = useState('');
  const surfaceColor = colors.surface;
  const [ambientColor, setAmbientColor] = useState<string>(surfaceColor);
  const [importExpanded, setImportExpanded] = useState(false);
  const [wikiText, setWikiText] = useState('');
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const [activityLevel, setActivityLevel] = useState(5);
  const addCharacter = useArchiveStore((s) => s.addCharacter);

  // Creation mode: form (guided) vs free (raw coreSetting)
  const [creationMode, setCreationMode] = useState<'form' | 'free'>('form');
  const [formFields, setFormFields] = useState({
    nickname: '', age: '', identity: '', appearance: '',
    personality: '', background: '', behavior: '', languageStyle: '',
  });
  const updateFormField = (key: keyof typeof formFields, val: string) =>
    setFormFields((prev) => ({ ...prev, [key]: val }));

  // AI character generation
  const [isGenerating, setIsGenerating] = useState(false);
  const abortRef = useRef(false);

  const FORM_LABELS: Record<string, string> = {
    nickname: '昵称', age: '年龄', identity: '身份', appearance: '外貌',
    personality: '性格', background: '背景', behavior: '行为模式', languageStyle: '语言风格',
  };

  const hasFormContent = Object.values(formFields).some((v) => v.trim().length > 0) || name.trim().length > 0;

  const callLLMForCharacter = async (mode: 'overwrite' | 'fill') => {
    const apiKey = await secureStore.getApiKey();
    const baseUrl = await secureStore.getBaseUrl();
    const model = await secureStore.getModel();
    if (!apiKey || !baseUrl) {
      Alert.alert('提示', '请先在设置中配置 API 密钥和地址');
      return;
    }

    setIsGenerating(true);
    abortRef.current = false;

    const existingInfo = mode === 'fill'
      ? Object.entries(formFields)
          .filter(([, v]) => v.trim())
          .map(([k, v]) => `${FORM_LABELS[k]}: ${v}`)
          .join('\n')
      : '';

    const nameInfo = name.trim() ? `角色名称：${name.trim()}\n` : '';
    const prompt = mode === 'fill'
      ? `你是一位创意写作助手。以下是角色的部分信息，请基于这些信息补全剩余的空白字段。保持已有信息不变，只填充空缺的部分。请严格以 JSON 格式输出，不要包含任何其他文字。

${nameInfo}${existingInfo}

输出格式（JSON）：
{
  "name": "角色名称",
  "nickname": "昵称/别名",
  "age": "年龄",
  "identity": "身份",
  "appearance": "外貌描述",
  "personality": "性格描述",
  "background": "背景设定",
  "behavior": "行为模式",
  "languageStyle": "语言风格"
}`
      : `你是一位创意写作助手。请随机创作一个有趣的角色，包含以下所有字段。角色可以来自任何题材（古代、现代、奇幻、科幻等）。请严格以 JSON 格式输出，不要包含任何其他文字。

输出格式（JSON）：
{
  "name": "角色名称",
  "nickname": "昵称/别名",
  "age": "年龄",
  "identity": "身份",
  "appearance": "外貌描述",
  "personality": "性格描述",
  "background": "背景设定",
  "behavior": "行为模式",
  "languageStyle": "语言风格"
}`;

    const config: LLMConfig = {
      apiKey, baseUrl, model: model || 'gpt-4o-mini',
      temperature: 0.9, maxTokens: 800,
    };

    try {
      let fullContent = '';
      const stream = streamChat({ systemPrompt: '你是一位创意写作助手，擅长创作丰富的角色设定。', messages: [{ role: 'user', content: prompt }], config });
      for await (const chunk of stream) {
        if (abortRef.current) break;
        fullContent += chunk;
      }

      if (abortRef.current) {
        setIsGenerating(false);
        return;
      }

      // Parse JSON from response (handle markdown code blocks)
      let jsonStr = fullContent.trim();
      const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
      }
      // Also try to find raw JSON object
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }

      const parsed = JSON.parse(jsonStr);

      if (mode === 'overwrite') {
        if (parsed.name && !name.trim()) setName(parsed.name);
      }
      const newFields = { ...formFields };
      for (const key of Object.keys(FORM_LABELS)) {
        if (mode === 'overwrite' || !formFields[key as keyof typeof formFields].trim()) {
          if (parsed[key]) {
            newFields[key as keyof typeof formFields] = parsed[key];
          }
        }
      }
      setFormFields(newFields);
    } catch (e) {
      console.error('[CreateCharacter::AI] Generation failed:', e);
      Alert.alert('生成失败', e instanceof Error ? e.message : 'AI 返回的内容无法解析，请重试');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAIGenerate = () => {
    if (isGenerating) {
      abortRef.current = true;
      return;
    }

    if (hasFormContent) {
      Alert.alert('AI 补全', '当前已有输入内容，如何处理？', [
        { text: '取消', style: 'cancel' },
        { text: '覆盖重新生成', style: 'destructive', onPress: () => callLLMForCharacter('overwrite') },
        { text: '补全剩余信息', onPress: () => callLLMForCharacter('fill') },
      ]);
    } else {
      callLLMForCharacter('overwrite');
    }
  };

  useEffect(() => {
    (async () => {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('需要权限', '上传头像需要访问媒体库权限');
      }
    })();
  }, []);

  // Auto-derive ambient color from name when user hasn't manually selected one
  const trimmedName = name.trim();
  const predictedAvatar = trimmedName ? trimmedName.charAt(0) : '?';
  const predictedColor = useMemo(() => {
    return trimmedName
      ? deriveColorFromName(trimmedName)
      : surfaceColor;
  }, [trimmedName, surfaceColor]);

  useEffect(() => {
    if (ambientColor === surfaceColor && trimmedName) {
      setAmbientColor(predictedColor);
    }
  }, [predictedColor, trimmedName, ambientColor, surfaceColor]);

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      const uri = result.assets[0].uri;
      // On web, convert blob:// URL to base64 data URI for persistence
      if (uri.startsWith('blob:')) {
        try {
          const resp = await fetch(uri);
          const blob = await resp.blob();
          const reader = new FileReader();
          reader.onloadend = () => {
            setAvatarUri(reader.result as string);
          };
          reader.readAsDataURL(blob);
        } catch (e) {
          console.error('[CreateCharacter] Blob to base64 failed:', e);
          setAvatarUri(uri);
        }
      } else {
        // On native: copy temp image to persistent document directory
        try {
          const persistentUri = copyToPersistentStorage(uri);
          setAvatarUri(persistentUri);
        } catch (e) {
          console.error('[CreateCharacter] Failed to persist avatar:', e);
          setAvatarUri(uri); // fallback: use temp URI (may break on restart)
        }
      }
    }
  };

  const assembleFormFields = (): string => {
    const LABELS: Record<string, string> = {
      nickname: '昵称', age: '年龄', identity: '身份', appearance: '外貌',
      personality: '性格', background: '背景', behavior: '行为模式', languageStyle: '语言风格',
    };
    const parts: string[] = [];
    for (const [key, label] of Object.entries(LABELS)) {
      const val = formFields[key as keyof typeof formFields].trim();
      if (val) parts.push(`【${label}】${val}`);
    }
    return parts.join('\n');
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    try {
      const avatar = avatarUri || name.trim().charAt(0);
      const finalCoreSetting = creationMode === 'form' ? assembleFormFields() : coreSetting.trim();
      await addCharacter({
        name: name.trim(),
        avatar,
        coreSetting: finalCoreSetting,
        activityLevel,
        ambientColor,
      });
      Alert.alert('保存成功', `${name.trim()} 已加入图鉴`);
      navigation.goBack();
    } catch (e) {
      console.error('[CreateCharacter] Save failed:', e);
      Alert.alert('保存失败', '角色创建失败，请检查数据库状态。\n\n' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleImport = async () => {
    if (!wikiText.trim()) return;
    console.log(`[AgenticImport::CreateChar] Parsing ${wikiText.length} chars...`);

    try {
      const parsed = parseWikiText(wikiText);
      console.log(`[AgenticImport::CreateChar] Extracted ${parsed.length} entries`);

      if (parsed.length === 0) {
        Alert.alert('导入失败', '未能从文本中解析出角色信息');
        return;
      }

      if (parsed.length === 1) {
        const entry = parsed[0];
        setName(entry.name);
        setCoreSetting(entry.coreSetting);
        setCreationMode('free');
        setWikiText('');
        setImportExpanded(false);
      } else {
        // Multiple entries — bulk import
        for (const entry of parsed) {
          await addCharacter({
            name: entry.name,
            avatar: entry.name.trim().charAt(0),
            coreSetting: entry.coreSetting || `从 Wiki 导入：${entry.name}`,
            activityLevel: 5,
            ambientColor: deriveColorFromName(entry.name),
          });
        }
        Alert.alert('导入完成', `成功导入 ${parsed.length} 个角色`);
        navigation.goBack();
      }
    } catch (e) {
      console.error('[AgenticImport::CreateChar] Error:', e);
      Alert.alert('导入失败', '解析 Wiki 文本时出错');
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ 返回</Text>
        </TouchableOpacity>
        <Text style={styles.title}>新角色</Text>
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
              <Text style={styles.importLabel}>粘贴包含角色信息的 Wiki 长文本</Text>
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
                  <Text style={[styles.importBtnText, { color: isDark ? '#000000' : '#FFFFFF' }]}>解析并导入</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelImportBtn} onPress={() => { setImportExpanded(false); setWikiText(''); }}>
                  <Text style={styles.cancelImportText}>取消</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Avatar picker */}
        <View style={styles.avatarSection}>
          <Text style={styles.avatarLabel}>头像</Text>
          <TouchableOpacity style={styles.avatarCircle} onPress={handlePickImage}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarPlaceholder}>{predictedAvatar}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.changeAvatarBtn} onPress={handlePickImage}>
            <Text style={styles.changeAvatarText}>
              {avatarUri ? '更换头像' : '上传头像'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.avatarHint}>
            支持上传图片，未上传时将取名称首字作为头像
          </Text>
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
            {/* Custom color (auto-derived) */}
            <TouchableOpacity
              style={[
                styles.colorSwatch,
                { backgroundColor: predictedColor },
                (ambientColor !== colors.surface && !AMBIENT_SWATCHES.includes(ambientColor as any)) && styles.colorSwatchSelected,
              ]}
              onPress={() => setAmbientColor(predictedColor)}
            >
              {(ambientColor !== colors.surface && !AMBIENT_SWATCHES.includes(ambientColor as any)) && (
                <View style={styles.colorCheck}>
                  <Text style={styles.colorCheckMark}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.colorHint}>点击色块选择，最后一个为自动生成的角色专属色</Text>
        </View>

        <Field label="名称" value={name} onChangeText={setName} placeholder="角色名称" required />

        {/* Creation mode toggle */}
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

        {creationMode === 'form' && (
          <TouchableOpacity
            style={[styles.aiBtn, isGenerating && styles.aiBtnActive]}
            onPress={handleAIGenerate}
          >
            {isGenerating ? (
              <View style={styles.aiBtnRow}>
                <ActivityIndicator size="small" color={colors.background} />
                <Text style={[styles.aiBtnText, styles.aiBtnTextActive]}>  生成中…（点击停止）</Text>
              </View>
            ) : (
              <Text style={[styles.aiBtnText, hasFormContent && styles.aiBtnTextHighlight]}>
                {hasFormContent ? '✨ AI 补全' : '🎲 AI 随机生成'}
              </Text>
            )}
          </TouchableOpacity>
        )}

        {creationMode === 'form' ? (
          <View style={styles.formFields}>
            <Field label="昵称/别名" value={formFields.nickname} onChangeText={(v) => updateFormField('nickname', v)} placeholder='可选，如"小林"' />
            <Field label="年龄" value={formFields.age} onChangeText={(v) => updateFormField('age', v)} placeholder='可选，如"17岁"' />
            <Field label="身份" value={formFields.identity} onChangeText={(v) => updateFormField('identity', v)} placeholder='可选，如"高中生、剑士"' />
            <Field label="外貌" value={formFields.appearance} onChangeText={(v) => updateFormField('appearance', v)} placeholder="身高、发色、服饰等…" multiline />
            <Field label="性格" value={formFields.personality} onChangeText={(v) => updateFormField('personality', v)} placeholder="温柔、傲娇、冷静…" multiline />
            <Field label="背景设定" value={formFields.background} onChangeText={(v) => updateFormField('background', v)} placeholder="生活状况、个人经历、社会关系…" multiline />
            <Field label="行为模式" value={formFields.behavior} onChangeText={(v) => updateFormField('behavior', v)} placeholder="爱好、厌恶、习惯…" multiline />
            <Field label="语言风格" value={formFields.languageStyle} onChangeText={(v) => updateFormField('languageStyle', v)} placeholder="口癖、语气、话题倾向…" multiline />
          </View>
        ) : (
          <Field label="核心设定" value={coreSetting} onChangeText={setCoreSetting} placeholder="输入角色的性格、口癖、目标、背景等…" multiline />
        )}

        {/* Advanced settings — collapsed by default */}
        {!advancedExpanded ? (
          <TouchableOpacity style={styles.advancedToggle} onPress={() => setAdvancedExpanded(true)}>
            <Text style={styles.advancedToggleText}>› 高阶设定</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.advancedSection}>
            <Text style={styles.advancedTitle}>发言积极性</Text>
            <View style={styles.activityOptions}>
              {[
                { label: '沉默寡言', value: 2 },
                { label: '普通', value: 5 },
                { label: '话痨抢答', value: 8 },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.activityChip,
                    activityLevel === opt.value && styles.activityChipSelected,
                  ]}
                  onPress={() => setActivityLevel(opt.value)}
                >
                  <Text
                    style={[
                      styles.activityChipText,
                      activityLevel === opt.value && styles.activityChipTextSelected,
                    ]}
                  >
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
  avatarSection: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  avatarLabel: {
    ...typography.caption,
    color: colors.text.tertiary,
    marginBottom: spacing.md,
  },
  avatarCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  avatarImage: {
    width: 96,
    height: 96,
  },
  avatarPlaceholder: {
    fontSize: 40,
  },
  changeAvatarBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  changeAvatarText: {
    ...typography.body,
    color: colors.text.primary,
    fontWeight: '500',
  },
  avatarHint: {
    ...typography.caption,
    color: colors.text.tertiary,
    marginTop: spacing.xs,
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
    minHeight: 100,
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
    marginBottom: spacing.sm,
  },
  // AI generate button
  aiBtn: {
    marginBottom: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.separator,
    alignItems: 'center',
  },
  aiBtnActive: {
    backgroundColor: colors.text.primary,
    borderColor: colors.text.primary,
  },
  aiBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  aiBtnText: {
    ...typography.body,
    color: colors.text.secondary,
  },
  aiBtnTextActive: {
    color: colors.background,
  },
  aiBtnTextHighlight: {
    color: colors.text.primary,
  },
  bottomSpacer: {
    height: spacing.xxl,
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
  advancedTitle: {
    ...typography.caption,
    color: colors.text.tertiary,
    marginBottom: spacing.sm,
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
