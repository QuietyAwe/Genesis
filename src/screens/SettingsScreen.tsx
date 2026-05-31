import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useArchiveStore } from '../stores/useArchiveStore';
import { useTheme } from '../hooks/useTheme';
import { lightImpact } from '../utils/haptics';
import { spacing, typography } from '../constants/theme';
import { deriveColorFromName } from '../utils/ambientColor';

const COMMON_MODELS = [
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4-turbo',
  'claude-sonnet-4-20250514',
  'claude-opus-4-20250514',
  'qwen-turbo',
  'qwen-plus',
  'deepseek-chat',
  'deepseek-reasoner',
];

export default function SettingsScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const apiKey = useSettingsStore((s) => s.apiKey);
  const baseUrl = useSettingsStore((s) => s.baseUrl);
  const model = useSettingsStore((s) => s.model);
  const temperature = useSettingsStore((s) => s.temperature);
  const maxTokens = useSettingsStore((s) => s.maxTokens);
  const contextWindow = useSettingsStore((s) => s.contextWindow);
  const colorScheme = useSettingsStore((s) => s.colorScheme);
  const availableModels = useSettingsStore((s) => s.availableModels);
  const fetchingModels = useSettingsStore((s) => s.fetchingModels);
  const setApiKey = useSettingsStore((s) => s.setApiKey);
  const setBaseUrl = useSettingsStore((s) => s.setBaseUrl);
  const setModel = useSettingsStore((s) => s.setModel);
  const setTemperature = useSettingsStore((s) => s.setTemperature);
  const setMaxTokens = useSettingsStore((s) => s.setMaxTokens);
  const setContextWindow = useSettingsStore((s) => s.setContextWindow);
  const setColorScheme = useSettingsStore((s) => s.setColorScheme);
  const fetchModels = useSettingsStore((s) => s.fetchModels);
  const load = useSettingsStore((s) => s.load);

  const [inputKey, setInputKey] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [inputModel, setInputModel] = useState('');
  const [inputTemp, setInputTemp] = useState('0.8');
  const [inputMaxTokens, setInputMaxTokens] = useState('1000');
  const [inputContextWindow, setInputContextWindow] = useState('20');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [savedField, setSavedField] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  const triggerSavedFeedback = (field: string) => {
    setSavedField(field);
    lightImpact();
    setTimeout(() => setSavedField(null), 1500);
  };

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setInputKey(apiKey ?? ''); }, [apiKey]);
  useEffect(() => { setInputUrl(baseUrl ?? ''); }, [baseUrl]);
  useEffect(() => { setInputModel(model ?? ''); }, [model]);
  useEffect(() => { setInputTemp(String(temperature)); }, [temperature]);
  useEffect(() => { setInputMaxTokens(String(maxTokens)); }, [maxTokens]);
  useEffect(() => { setInputContextWindow(String(contextWindow)); }, [contextWindow]);

  const handleModelSelect = (m: string) => {
    setInputModel(m);
    setModel(m);
    setShowModelDropdown(false);
  };

  const handleSaveTemp = () => {
    const v = parseFloat(inputTemp);
    if (isNaN(v) || v < 0 || v > 2) {
      Alert.alert('参数错误', 'Temperature 必须在 0-2 之间');
      return;
    }
    setTemperature(v);
  };

  const handleSaveMaxTokens = () => {
    const v = parseInt(inputMaxTokens, 10);
    if (isNaN(v) || v < 1 || v > 8192) {
      Alert.alert('参数错误', 'Max Tokens 必须在 1-8192 之间');
      return;
    }
    setMaxTokens(v);
  };

  const handleSaveContextWindow = () => {
    const v = parseInt(inputContextWindow, 10);
    if (isNaN(v) || v < 1 || v > 100) {
      Alert.alert('参数错误', 'Context Window 必须在 1-100 之间（对话轮数）');
      return;
    }
    setContextWindow(v);
  };

  // Merge fetched models with common defaults, prioritizing COMMON_MODELS at the top
  const modelOptions = useMemo(() => {
    const commonFirst = COMMON_MODELS.filter(m => availableModels.includes(m));
    const others = availableModels.filter(m => !COMMON_MODELS.includes(m)).sort();
    return [...commonFirst, ...others];
  }, [availableModels]);
  const filteredOptions = inputModel
    ? modelOptions.filter((m) => m.toLowerCase().includes(inputModel.toLowerCase()))
    : modelOptions;

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.text.primary }]}>设置</Text>

        <Field label="API Key" value={inputKey} onChangeText={setInputKey} onSave={() => { setApiKey(inputKey); triggerSavedFeedback('apiKey'); }} placeholder="sk-..." secureTextEntry colors={colors} />
        <Field label="Base URL" value={inputUrl} onChangeText={setInputUrl} onSave={() => { setBaseUrl(inputUrl); triggerSavedFeedback('baseUrl'); }} placeholder="https://api.example.com/v1" colors={colors} />

        {/* Model selector with dropdown */}
        <View style={styles.section}>
          <View style={styles.modelHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>模型</Text>
            <TouchableOpacity
              style={[styles.fetchBtn, fetchingModels && styles.fetchBtnDisabled]}
              onPress={async () => {
                if (!apiKey || !baseUrl) {
                  Alert.alert('提示', '请先填写并保存 API Key 和 Base URL');
                  return;
                }
                try {
                  await fetchModels();
                  const count = useSettingsStore.getState().availableModels.length;
                  if (count > 0) {
                    Alert.alert('成功', `已获取 ${count} 个模型`);
                  } else {
                    Alert.alert('提示', 'API 返回了空列表，请检查 Base URL 是否正确（需包含 /v1）');
                  }
                } catch (e) {
                  const msg = e instanceof Error ? e.message : '未知错误';
                  Alert.alert('获取失败', msg);
                }
              }}
              disabled={fetchingModels}
            >
              <Text style={styles.fetchBtnText}>
                {fetchingModels ? '获取中...' : '获取模型列表'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.modelInputRow}>
            <TextInput
              ref={inputRef}
              style={[styles.modelInput, { color: colors.text.primary, borderBottomColor: colors.separator }]}
              value={inputModel}
              onChangeText={(t) => {
                setInputModel(t);
                setShowModelDropdown(true);
              }}
              onFocus={() => setShowModelDropdown(true)}
              placeholder="输入或选择模型"
              placeholderTextColor={colors.text.tertiary}
              onBlur={() => setTimeout(() => setShowModelDropdown(false), 200)}
            />
            {inputModel.trim() ? (
              <TouchableOpacity style={styles.saveBtn} onPress={() => { setModel(inputModel); triggerSavedFeedback('model'); }}>
                <Text style={[styles.saveBtnText, savedField === 'model' && { color: '#34D399' }]}>
                  {savedField === 'model' ? '已保存' : '保存'}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Dropdown */}
          {showModelDropdown && filteredOptions.length > 0 && (
            <ScrollView style={styles.dropdownList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
              {filteredOptions.map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.dropdownItem, inputModel === m && styles.dropdownItemActive, inputModel === m && { backgroundColor: colors.surface }]}
                  onPress={() => handleModelSelect(m)}
                >
                  <Text style={[styles.dropdownText, inputModel === m && styles.dropdownTextActive, inputModel === m && { color: colors.text.primary }]}>
                    {m}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Model Parameters */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>模型参数</Text>

          <View style={styles.paramRow}>
            <Text style={[styles.paramLabel, { color: colors.text.tertiary }]}>Temperature</Text>
            <View style={styles.paramInputRow}>
              <TextInput
                style={[styles.paramInput, { color: colors.text.primary, borderBottomColor: colors.separator }]}
                value={inputTemp}
                onChangeText={setInputTemp}
                placeholder="0.8"
                placeholderTextColor={colors.text.tertiary}
                keyboardType="numeric"
              />
              <TouchableOpacity style={styles.saveBtn} onPress={() => { handleSaveTemp(); triggerSavedFeedback('temp'); }}>
                <Text style={[styles.saveBtnText, savedField === 'temp' && { color: '#34D399' }]}>
                  {savedField === 'temp' ? '已保存' : '保存'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.paramRow}>
            <Text style={[styles.paramLabel, { color: colors.text.tertiary }]}>Max Tokens</Text>
            <View style={styles.paramInputRow}>
              <TextInput
                style={[styles.paramInput, { color: colors.text.primary, borderBottomColor: colors.separator }]}
                value={inputMaxTokens}
                onChangeText={setInputMaxTokens}
                placeholder="1000"
                placeholderTextColor={colors.text.tertiary}
                keyboardType="numeric"
              />
              <TouchableOpacity style={styles.saveBtn} onPress={() => { handleSaveMaxTokens(); triggerSavedFeedback('maxTokens'); }}>
                <Text style={[styles.saveBtnText, savedField === 'maxTokens' && { color: '#34D399' }]}>
                  {savedField === 'maxTokens' ? '已保存' : '保存'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.paramRow}>
            <Text style={[styles.paramLabel, { color: colors.text.tertiary }]}>Context Window (对话轮数)</Text>
            <View style={styles.paramInputRow}>
              <TextInput
                style={[styles.paramInput, { color: colors.text.primary, borderBottomColor: colors.separator }]}
                value={inputContextWindow}
                onChangeText={setInputContextWindow}
                placeholder="20"
                placeholderTextColor={colors.text.tertiary}
                keyboardType="numeric"
              />
              <TouchableOpacity style={styles.saveBtn} onPress={() => { handleSaveContextWindow(); triggerSavedFeedback('contextWindow'); }}>
                <Text style={[styles.saveBtnText, savedField === 'contextWindow' && { color: '#34D399' }]}>
                  {savedField === 'contextWindow' ? '已保存' : '保存'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Appearance */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>外观</Text>
          <View style={styles.appearanceRow}>
            <Text style={[styles.appearanceLabel, { color: colors.text.primary }]}>深色模式</Text>
            <Switch
              value={colorScheme === 'dark'}
              onValueChange={(v) => { setColorScheme(v ? 'dark' : 'light'); lightImpact(); }}
              trackColor={{ false: colors.separator, true: colors.accent }}
              thumbColor={colors.text.primary}
            />
          </View>
          <Text style={[styles.appearanceHint, { color: colors.text.tertiary }]}>
            当前：{colorScheme === 'system' ? '跟随系统' : colorScheme === 'dark' ? '深色' : '浅色'}
          </Text>
        </View>

        {/* Agentic Import */}
        <AgenticImportSection />

        {/* Prompt Blueprint Link */}
        <TouchableOpacity
          style={styles.section}
          onPress={() => (navigation as any).navigate('PromptBlueprint')}
        >
          <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>提示词蓝图</Text>
          <Text style={[styles.placeholder, { color: colors.text.tertiary }]}>编辑系统 Prompt 模板，使用变量标签动态注入内容</Text>
        </TouchableOpacity>

        <View style={styles.note}>
          <Text style={[styles.noteText, { color: colors.text.tertiary }]}>
            API Key 使用系统 Keychain/Keystore 加密存储，仅保存在本地设备上。
          </Text>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </TouchableWithoutFeedback>
  );
}

function AgenticImportSection() {
  const { colors, isDark } = useTheme();
  const addCharacter = useArchiveStore((s) => s.addCharacter);
  const [wikiText, setWikiText] = useState('');
  const [importing, setImporting] = useState(false);
  const [expanded, setExpanded] = useState(false);

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

    // Strategy 2: If no headers found, try pattern "Name: description" or "Name — description"
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

    return results.slice(0, 20); // safety cap
  }

  const handleImport = async () => {
    if (!wikiText.trim()) return;
    setImporting(true);
    console.log(`[AgenticImport] Parsing ${wikiText.length} chars of Wiki text...`);

    try {
      const parsed = parseWikiText(wikiText);
      console.log(`[AgenticImport] Extracted ${parsed.length} entries`);

      for (const entry of parsed) {
        await addCharacter({
          name: entry.name,
          avatar: '🎭',
          coreSetting: entry.coreSetting || `从 Wiki 导入：${entry.name}`,
          activityLevel: 5,
          ambientColor: deriveColorFromName(entry.name),
        });
      }

      Alert.alert('导入完成', `成功导入 ${parsed.length} 个角色/条目`);
      setWikiText('');
    } catch (e) {
      console.error('[AgenticImport] Error:', e);
      Alert.alert('导入失败', '解析 Wiki 文本时出错');
    } finally {
      setImporting(false);
    }
  };

  if (!expanded) {
    return (
      <TouchableOpacity style={styles.section} onPress={() => setExpanded(true)}>
        <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>Agentic Import</Text>
        <Text style={[styles.placeholder, { color: colors.text.tertiary }]}>从粘贴的 Wiki 长文本中拆解并导入角色（本地预处理）</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>Agentic Import</Text>
      <Text style={[styles.importHint, { color: colors.text.tertiary }]}>粘贴包含角色信息的 Wiki 长文本，系统将自动拆解为结构化角色卡片。</Text>
      <TextInput
        style={[styles.importText, { color: colors.text.primary, borderColor: colors.separator }]}
        value={wikiText}
        onChangeText={setWikiText}
        placeholder="在此粘贴 Wiki 文本..."
        placeholderTextColor={colors.text.tertiary}
        multiline
        textAlignVertical="top"
      />
      <View style={styles.importActions}>
        <TouchableOpacity style={[styles.importBtn, { backgroundColor: colors.text.primary }]} onPress={handleImport} disabled={importing || !wikiText.trim()}>
          <Text style={[styles.importBtnText, { color: isDark ? '#000000' : '#FFFFFF' }]}>{importing ? '解析中...' : '导入'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelImportBtn} onPress={() => { setExpanded(false); setWikiText(''); }}>
          <Text style={[styles.cancelImportText, { color: colors.text.tertiary }]}>收起</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  onSave,
  placeholder,
  secureTextEntry,
  colors,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  onSave: () => void;
  placeholder: string;
  secureTextEntry?: boolean;
  colors: ReturnType<typeof import('../hooks/useTheme').useTheme>['colors'];
}) {
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    onSave();
    setSaved(true);
    lightImpact();
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>{label}</Text>
      <TextInput
        style={[styles.input, { color: colors.text.primary, borderBottomColor: colors.separator }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.text.tertiary}
        secureTextEntry={secureTextEntry}
        blurOnSubmit
      />
      {value.trim() ? (
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={[styles.saveBtnText, saved && { color: '#34D399' }]}>
            {saved ? '已保存' : '保存'}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
  },
  title: {
    ...typography.heading,
    marginBottom: spacing.xl,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.subheading,
    marginBottom: spacing.sm,
  },
  input: {
    ...typography.body,
    borderBottomWidth: 1,
    paddingVertical: spacing.sm,
    fontSize: 16,
  },
  saveBtn: {
    marginTop: spacing.sm,
    alignSelf: 'flex-end',
  },
  saveBtnText: {
    ...typography.body,
    fontWeight: '500',
  },
  modelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  fetchBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  fetchBtnDisabled: {
    opacity: 0.4,
  },
  fetchBtnText: {
    ...typography.caption,
    fontWeight: '500',
  },
  modelInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modelInput: {
    flex: 1,
    ...typography.body,
    borderBottomWidth: 1,
    paddingVertical: spacing.sm,
    fontSize: 16,
  },
  dropdownList: {
    maxHeight: 200,
  },
  dropdownItem: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  dropdownItemActive: {
  },
  dropdownText: {
    ...typography.body,
    fontSize: 14,
  },
  dropdownTextActive: {
    fontWeight: '500',
  },
  placeholder: {
    ...typography.caption,
  },
  paramRow: {
    marginTop: spacing.md,
  },
  paramLabel: {
    ...typography.caption,
    marginBottom: spacing.xs,
  },
  paramInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  paramInput: {
    flex: 1,
    ...typography.body,
    borderBottomWidth: 1,
    paddingVertical: spacing.sm,
    fontSize: 16,
  },
  note: {
    marginTop: spacing.lg,
  },
  noteText: {
    ...typography.caption,
    lineHeight: 20,
  },
  appearanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  appearanceLabel: {
    ...typography.body,
    fontWeight: '400',
  },
  appearanceHint: {
    ...typography.caption,
  },
  bottomSpacer: {
    height: spacing.xxl,
  },
  importHint: {
    ...typography.caption,
    marginBottom: spacing.sm,
    lineHeight: 20,
  },
  importText: {
    ...typography.body,
    borderWidth: 1,
    borderRadius: 8,
    padding: spacing.md,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  importActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  importBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
  },
  importBtnText: {
    ...typography.body,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  cancelImportBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  cancelImportText: {
    ...typography.caption,
  },
});
