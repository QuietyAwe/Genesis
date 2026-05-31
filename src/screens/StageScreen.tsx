import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useStageStore } from '../stores/useStageStore';
import { useArchiveStore } from '../stores/useArchiveStore';
import { ChatMessage, Character, Stage } from '../types';
import { useTheme } from '../hooks/useTheme';
import { colors, spacing, typography } from '../constants/theme';
import { exportToMarkdown, copyToClipboard } from '../services/export/markdown';
import * as stageDao from '../services/db/stageDao';
import { lightImpact, mediumImpact, selection } from '../utils/haptics';

const HEADER_HEIGHT = 80;
const FOOTER_HEIGHT = 12;

export default function StageScreen() {
  const { colors, isDark } = useTheme();
  const navigation = useNavigation();
  const allMessages = useStageStore((s) => s.allMessages);
  const activeBranchId = useStageStore((s) => s.activeBranchId);
  const characters = useStageStore((s) => s.characters);
  const stage = useStageStore((s) => s.stage);
  const isStreaming = useStageStore((s) => s.isStreaming);
  const streamingContent = useStageStore((s) => s.streamingContent);
  const currentSpeaker = useStageStore((s) => s.currentSpeaker);
  const apiError = useStageStore((s) => s.apiError);
  const clearApiError = useStageStore((s) => s.clearApiError);
  const stageSummary = useStageStore((s) => s.stageSummary);
  const lastPrompt = useStageStore((s) => s.lastPrompt);
  const [debugVisible, setDebugVisible] = useState(false);
  const createStage = useStageStore((s) => s.createStage);
  const sendMessage = useStageStore((s) => s.sendMessage);
  const loadStage = useStageStore((s) => s.loadStage);
  const triggerAutoReply = useStageStore((s) => s.triggerAutoReply);
  const regenerateMessage = useStageStore((s) => s.regenerateMessage);
  const deleteBranch = useStageStore((s) => s.deleteBranch);
  const switchBranch = useStageStore((s) => s.switchBranch);
  const prepareSwitchBranch = useStageStore((s) => s.prepareSwitchBranch);
  const getBranches = useStageStore((s) => s.getBranches);
  const pendingSwitch = useStageStore((s) => s.pendingSwitch);
  const forkIndex = useStageStore((s) => s.forkIndex);

  const displayedMessages = activeBranchId
    ? allMessages.filter((m) => m.branchId === activeBranchId)
    : allMessages;

  const [inputText, setInputText] = useState('');
  const [identityMode, setIdentityMode] = useState<'narrator' | 'character' | 'guest'>('narrator');
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [showStageList, setShowStageList] = useState(false);
  const [allStages, setAllStages] = useState<Stage[]>([]);
  const flatListRef = useRef<FlatList>(null);

  const openStageSwitcher = async () => {
    const stages = await stageDao.getAllStages();
    setAllStages(stages);
    setShowStageList(true);
  };

  const handleStageSelect = async (stageId: string) => {
    setShowStageList(false);
    if (stageId === stage?.id) return;
    console.log(`[Stage] Switching to stage: ${stageId}`);
    await useStageStore.getState().selectStage(stageId);
    setIdentityMode('narrator');
    setSelectedCharacter(null);
  };

  const handleDeleteStage = (s: Stage) => {
    Alert.alert(
      '删除舞台',
      `确定要删除「${s.name}」吗？\n该舞台的所有聊天记录也将被清除。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log(`[Stage] Deleting stage: ${s.id} (${s.name})`);
              await stageDao.deleteStage(s.id);
              setShowStageList(false);
              const remaining = await stageDao.getAllStages();
              setAllStages(remaining);
              if (stage?.id === s.id) {
                if (remaining.length > 0) {
                  await useStageStore.getState().selectStage(remaining[0].id);
                } else {
                  useStageStore.setState({ stage: null, allMessages: [], characters: [] });
                }
              }
            } catch (e) {
              console.error('[Stage] Failed to delete stage:', e);
              Alert.alert('错误', '删除舞台失败');
            }
          },
        },
      ],
    );
  };

  useEffect(() => {
    const ensureLoaded = async () => {
      try {
        console.log('[Stage] Ensuring archive and stage are loaded...');
        const archive = useArchiveStore.getState();
        if (archive.characters.length === 0 && archive.worlds.length === 0) {
          console.log('[Stage] Archive not loaded, calling load()...');
          await useArchiveStore.getState().load();
        }
        const chars = useArchiveStore.getState().characters;
        console.log(`[Stage] Characters available: ${chars.length}`);

        if (chars.length > 0) {
          const ids = chars.map((c) => c.id);
          const currentStage = useStageStore.getState().stage;
          if (!currentStage) {
            const stageDao = await import('../services/db/stageDao');
            const existingStages = await stageDao.getAllStages();
            if (existingStages.length > 0) {
              console.log(`[Stage] Found ${existingStages.length} existing stage(s) in DB, loading first`);
              await useStageStore.getState().loadStage(existingStages[0].id);
              console.log(`[Stage] loadStage complete, store chars: ${useStageStore.getState().characters.length}`);
            } else {
              console.log('[Stage] Creating new stage "第一幕"');
              await createStage('第一幕', ids);
              console.log(`[Stage] createStage complete, store chars: ${useStageStore.getState().characters.length}`);
            }
          } else {
            console.log(`[Stage] Loading existing stage: ${currentStage.id}`);
            await loadStage(currentStage.id);
          }
        }
      } catch (e) {
        console.error('[Stage] Failed to initialize stage:', e);
      } finally {
        setInitializing(false);
      }
    };
    ensureLoaded();
  }, [createStage, loadStage]);

  useEffect(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
  }, [displayedMessages, streamingContent]);

  // Scroll-first branch switch: scroll to fork point, then switch branch
  const switchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!pendingSwitch) return;
    const { targetBranchId, forkIndex: scrollIdx } = pendingSwitch;

    // Delay to wait for any prior renders
    const timer = setTimeout(() => {
      if (scrollIdx > 0) {
        try {
          flatListRef.current?.scrollToIndex({ index: scrollIdx, animated: true, viewPosition: 0.3 });
        } catch {
          flatListRef.current?.scrollToEnd({ animated: true });
        }
      }
      // Switch branch after scroll animation completes
      switchTimerRef.current = setTimeout(() => {
        switchBranch(targetBranchId);
      }, scrollIdx > 0 ? 500 : 0);
    }, 100);

    return () => {
      clearTimeout(timer);
      if (switchTimerRef.current) clearTimeout(switchTimerRef.current);
    };
  }, [pendingSwitch, switchBranch]);

  // Clear forkIndex after fade-in animation completes
  useEffect(() => {
    if (forkIndex < 0) return;
    const timer = setTimeout(() => {
      useStageStore.setState({ forkIndex: -1 });
    }, 500);
    return () => clearTimeout(timer);
  }, [forkIndex]);

  const handleSend = () => {
    if (!inputText.trim() || isStreaming) return;
    lightImpact();

    let senderType: ChatMessage['senderType'];
    let senderName: string;
    let senderAvatar: string;
    let senderId: string | undefined;

    switch (identityMode) {
      case 'narrator':
        senderType = 'narrator';
        senderName = '';
        senderAvatar = '';
        break;
      case 'character':
        if (selectedCharacter) {
          senderType = 'character';
          senderName = selectedCharacter.name;
          senderAvatar = selectedCharacter.avatar;
          senderId = selectedCharacter.id;
        } else {
          senderType = 'guest';
          senderName = '神秘人';
          senderAvatar = '👤';
        }
        break;
      case 'guest':
        senderType = 'guest';
        senderName = '神秘人';
        senderAvatar = '👤';
        break;
    }

    sendMessage(inputText.trim(), senderType, senderName, senderAvatar, senderId);
    setInputText('');
  };

  const handleForceSpeaker = (char: Character) => {
    selection();
    setSelectedCharacter(char);
    setIdentityMode('character');
    if (inputText.trim() && !isStreaming) {
      sendMessage(inputText.trim(), 'character', char.name, char.avatar, char.id);
      setInputText('');
    }
  };

  const handleAutoPlay = () => {
    if (isStreaming) {
      console.log('[Stage::AutoPlay] Already streaming, ignoring');
      return;
    }
    console.log('[Stage::AutoPlay] Triggering auto-reply');
    mediumImpact();
    triggerAutoReply();
  };

  const branches = getBranches();

  const handleBranchSwitch = (direction: 'left' | 'right') => {
    if (branches.length < 2) return;
    const activeIdx = branches.findIndex((b) => b.branchId === activeBranchId);
    let newIdx = direction === 'left' ? activeIdx - 1 : activeIdx + 1;
    if (newIdx < 0) newIdx = branches.length - 1;
    if (newIdx >= branches.length) newIdx = 0;
    prepareSwitchBranch(branches[newIdx].branchId);
  };

  const handleDotSwitch = (targetBranchId: string) => {
    if (targetBranchId === activeBranchId) return;
    prepareSwitchBranch(targetBranchId);
  };

  const handleExport = async () => {
    if (!stage || displayedMessages.length === 0) {
      Alert.alert('导出', '暂无内容可导出');
      return;
    }
    const worlds = useArchiveStore.getState().worlds;
    const world = stage.worldIds.length > 0 ? worlds.find((w) => w.id === stage.worldIds[0]) : undefined;

    const md = exportToMarkdown({
      stage,
      messages: displayedMessages,
      characters,
      world,
    });

    const ok = await copyToClipboard(md);
    if (ok) {
      Alert.alert('导出成功', 'Markdown 内容已复制到剪贴板');
    } else {
      Alert.alert('导出', '已生成 Markdown 文档（长按可复制）', [
        { text: '好的' },
      ]);
      console.log(`[Stage::Export] Markdown generated (${md.length} chars)`);
    }
  };

  if (initializing) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Text style={[styles.stageName, { color: colors.text.primary }]}>舞台</Text>
        </View>
        <View style={styles.emptyState}>
          <Text style={[styles.loadingText, { color: colors.text.tertiary }]}>初始化舞台...</Text>
        </View>
      </View>
    );
  }

  if (!stage || characters.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Text style={[styles.stageName, { color: colors.text.primary }]}>舞台</Text>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => (navigation as any).navigate('StageSetup')}>
            <Text style={[styles.headerIconText, { color: colors.text.primary }]}>+</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🎭</Text>
          <Text style={[styles.emptyText, { color: colors.text.primary }]}>暂无舞台</Text>
          <Text style={[styles.emptyHint, { color: colors.text.tertiary }]}>
            {useArchiveStore.getState().characters.length > 0
              ? '图鉴中已有角色，点击右上角 + 创建舞台开始推演。'
              : '请先在图鉴中创建角色，然后来这里开始推演。'}
          </Text>
          {useArchiveStore.getState().characters.length === 0 && (
            <TouchableOpacity style={[styles.emptyBtn, { backgroundColor: colors.text.primary }]} onPress={() => (navigation as any).navigate('Archive')}>
              <Text style={[styles.emptyBtnText, { color: isDark ? '#000000' : '#FFFFFF' }]}>前往图鉴</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.stageNameBtn} onPress={openStageSwitcher} onLongPress={() => setDebugVisible(true)} delayLongPress={500}>
          <Text style={[styles.stageName, { color: colors.text.primary }]}>{stage.name}</Text>
          <Text style={[styles.stageChevron, { color: colors.text.tertiary }]}>▾</Text>
        </TouchableOpacity>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => (navigation as any).navigate('StageSetup')}>
            <Text style={[styles.headerIconText, { color: colors.text.primary }]}>+</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIconBtn} onPress={handleExport}>
            <Text style={styles.headerIconText}>📋</Text>
          </TouchableOpacity>
          {isStreaming ? (
            <Text style={[styles.streamingIndicator, { color: colors.text.tertiary }]}>生成中...</Text>
          ) : (
            <TouchableOpacity style={styles.autoPlayBtn} onPress={handleAutoPlay}>
              <Text style={[styles.autoPlayText, { color: colors.text.secondary }]}>▶ 自动推演</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Message list */}
      <FlatList
        ref={flatListRef}
        data={displayedMessages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={<View style={{ height: HEADER_HEIGHT }} />}
        renderItem={({ item, index }) => (
          <>
            {index === forkIndex && forkIndex > 0 && (
              <View style={styles.branchDivider}>
                <View style={[styles.branchDividerLine, { backgroundColor: colors.text.tertiary }]} />
                <Text style={[styles.branchDividerText, { color: colors.text.tertiary }]}>从这里开始分叉</Text>
                <View style={[styles.branchDividerLine, { backgroundColor: colors.text.tertiary }]} />
              </View>
            )}
            <SwipeableMessage
              msg={item}
              isStreaming={false}
              isNewForkMessage={forkIndex >= 0 && index >= forkIndex}
              onRegenerate={() => regenerateMessage(item.id)}
              onDelete={() => deleteBranch(item.branchId, item.id)}
              colors={colors}
            />
          </>
        )}
        ListFooterComponent={
          <>
            {streamingContent ? (
              <MessageItem
                senderType="character"
                senderName={currentSpeaker || ''}
                senderAvatar={characters.find((c) => c.name === currentSpeaker)?.avatar || '🎭'}
                content={streamingContent}
                isStreaming
                colors={colors}
              />
            ) : (
              <View style={styles.bottomSpacer} />
            )}
            <View style={{ height: FOOTER_HEIGHT }} />
          </>
        }
      />

      {/* Footer */}
      <View style={[styles.footer, { backgroundColor: colors.background }]}>
        <View style={[styles.speakerBar, { borderTopColor: colors.separator }]}>
          {characters.map((c) => {
            const isSelected = selectedCharacter?.id === c.id;
            const isImage = (c.avatar || '').startsWith('file://') || (c.avatar || '').startsWith('data:') || (c.avatar || '').startsWith('http');
            return (
              <TouchableOpacity
                key={c.id}
                style={[styles.speakerAvatar, { backgroundColor: colors.surface }, isSelected && { borderWidth: 2, borderColor: colors.text.primary, backgroundColor: colors.text.primary }]}
                onPress={() => handleForceSpeaker(c)}
                disabled={isStreaming}
              >
                {isImage ? (
                  <Image source={{ uri: c.avatar }} style={styles.speakerAvatarImage} />
                ) : (
                  <Text style={styles.speakerEmoji}>{c.avatar}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={[styles.inputArea, { backgroundColor: colors.background, borderTopColor: colors.separator }]}>
          <TouchableOpacity
            style={[styles.identityBtn, { backgroundColor: colors.surface }]}
            onPress={() => {
              selection();
              const modes = ['narrator', 'character', 'guest'] as const;
              const idx = modes.indexOf(identityMode);
              setIdentityMode(modes[(idx + 1) % modes.length]);
            }}
          >
            {identityMode === 'narrator' ? (
              <Text style={styles.identityText}>📜</Text>
            ) : identityMode === 'character' ? (
              selectedCharacter ? (
                (selectedCharacter.avatar || '').startsWith('file://') || (selectedCharacter.avatar || '').startsWith('data:') || (selectedCharacter.avatar || '').startsWith('http') ? (
                  <Image source={{ uri: selectedCharacter.avatar }} style={styles.identityAvatar} />
                ) : (
                  <Text style={styles.identityText}>{selectedCharacter.avatar}</Text>
                )
              ) : (
                <Text style={styles.identityText}>🎭</Text>
              )
            ) : (
              <Text style={styles.identityText}>👤</Text>
            )}
          </TouchableOpacity>
          <TextInput
            style={[styles.input, { color: colors.text.primary }]}
            value={inputText}
            onChangeText={setInputText}
            placeholder={
              identityMode === 'narrator'
                ? '旁白：描述场景或事件...'
                : identityMode === 'character' && selectedCharacter
                ? `${selectedCharacter.name}：输入台词...`
                : '神秘人：发言...'
            }
            placeholderTextColor={colors.text.tertiary}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            style={[styles.sendBtn, { backgroundColor: inputText.trim() && !isStreaming ? colors.text.primary : colors.separator }, (!inputText.trim() || isStreaming) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || isStreaming}
          >
            <Text style={[styles.sendText, { color: isDark ? '#000000' : '#FFFFFF' }]}>›</Text>
          </TouchableOpacity>
        </View>

        {branches.length > 0 && (
          <View style={[styles.branchBar, { backgroundColor: colors.background, borderTopColor: colors.separator }]}>
            <TouchableOpacity style={styles.branchNavBtn} onPress={() => handleBranchSwitch('left')}>
              <Text style={[styles.branchNavText, { color: colors.text.secondary }]}>‹</Text>
            </TouchableOpacity>
            <View style={styles.branchDots}>
              {branches.map((b) => (
                <TouchableOpacity key={b.branchId} style={styles.branchDot} onPress={() => handleDotSwitch(b.branchId)}>
                  <View style={[styles.branchDotInner, { backgroundColor: colors.text.tertiary }, b.branchId === activeBranchId && { backgroundColor: colors.text.primary, width: 10, height: 10, borderRadius: 5 }]} />
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.branchNavBtn} onPress={() => handleBranchSwitch('right')}>
              <Text style={[styles.branchNavText, { color: colors.text.secondary }]}>›</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Stage switcher overlay */}
      {showStageList && (
        <View style={styles.overlay}>
          <TouchableOpacity style={styles.overlayBackdrop} onPress={() => setShowStageList(false)} activeOpacity={1} />
          <View style={[styles.stageList, { backgroundColor: isDark ? '#1A1A1A' : '#FFFFFF' }]}>
            <Text style={[styles.stageListTitle, { color: colors.text.tertiary, borderBottomColor: colors.separator }]}>切换舞台</Text>
            {allStages.map((s) => (
              <TouchableOpacity
                key={s.id}
                style={[styles.stageListItem, s.id === stage?.id && { backgroundColor: isDark ? '#2A2A2A' : '#F5F5F5' }]}
                onPress={() => handleStageSelect(s.id)}
                onLongPress={() => handleDeleteStage(s)}
                delayLongPress={500}
              >
                <Text style={[styles.stageListItemText, { color: colors.text.primary }, s.id === stage?.id && { fontWeight: '600' }]}>
                  {s.name}
                </Text>
                {s.id === stage?.id ? (
                  <Text style={[styles.stageListCheck, { color: colors.text.primary }]}>✓</Text>
                ) : (
                  <Text style={[styles.stageListDeleteHint, { color: colors.text.tertiary }]}>长按删除</Text>
                )}
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.stageListNewBtn, { borderColor: colors.text.primary }]}
              onPress={() => {
                setShowStageList(false);
                (navigation as any).navigate('StageSetup');
              }}
            >
              <Text style={[styles.stageListNewText, { color: colors.text.primary }]}>+ 新建舞台</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Debug prompt inspector */}
      {debugVisible && lastPrompt && (
        <View style={styles.overlay}>
          <TouchableOpacity style={styles.overlayBackdrop} onPress={() => setDebugVisible(false)} activeOpacity={1} />
          <View style={[styles.debugPanel, { backgroundColor: isDark ? '#1A1A1A' : '#FFFFFF' }]}>
            <Text style={[styles.debugPanelTitle, { color: colors.text.primary }]}>🔍 提示词调试</Text>
            <Text style={[styles.debugPanelSubtitle, { color: colors.text.tertiary }]}>System Prompt</Text>
            <ScrollView style={styles.debugScroll} showsVerticalScrollIndicator>
              <Text style={[styles.debugText, { color: colors.text.primary }]}>{lastPrompt.system}</Text>
              <Text style={[styles.debugPanelSubtitle, { color: colors.text.tertiary }]}>API Messages</Text>
              <Text style={[styles.debugText, { color: colors.text.primary }]}>{lastPrompt.messages}</Text>
              <View style={styles.debugBottomPadding} />
            </ScrollView>
            <TouchableOpacity style={[styles.debugCloseBtn, { backgroundColor: colors.text.primary }]} onPress={() => setDebugVisible(false)}>
              <Text style={[styles.debugCloseText, { color: isDark ? '#000000' : '#FFFFFF' }]}>关闭</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {debugVisible && !lastPrompt && (
        <View style={styles.overlay}>
          <TouchableOpacity style={styles.overlayBackdrop} onPress={() => setDebugVisible(false)} activeOpacity={1} />
          <View style={[styles.debugPanel, { backgroundColor: isDark ? '#1A1A1A' : '#FFFFFF' }]}>
            <Text style={[styles.debugPanelTitle, { color: colors.text.primary }]}>🔍 提示词调试</Text>
            <Text style={[styles.debugEmptyText, { color: colors.text.tertiary }]}>暂无历史 — 请先触发一次角色发言</Text>
            <TouchableOpacity style={[styles.debugCloseBtn, { backgroundColor: colors.text.primary }]} onPress={() => setDebugVisible(false)}>
              <Text style={[styles.debugCloseText, { color: isDark ? '#000000' : '#FFFFFF' }]}>关闭</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function SwipeableMessage({
  msg,
  isStreaming,
  isNewForkMessage,
  onRegenerate,
  onDelete,
  colors,
}: {
  msg: ChatMessage;
  isStreaming: boolean;
  isNewForkMessage?: boolean;
  onRegenerate: () => void;
  onDelete: () => void;
  colors: typeof import('../constants/theme').colors;
}) {
  const { isDark } = useTheme();
  const panX = useRef(new Animated.Value(0)).current;
  const isRegenerating = useRef(false);
  const currentX = useRef(0);
  const startX = useRef(0);
  const sidebarW = 140;

  // Fade-in animation for new fork messages
  const fadeAnim = useRef(new Animated.Value(isNewForkMessage ? 0 : 1)).current;
  useEffect(() => {
    if (isNewForkMessage) {
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    }
  }, [isNewForkMessage, fadeAnim]);

  const snapTo = useCallback((toValue: number) => {
    currentX.current = toValue;
    Animated.spring(panX, {
      toValue,
      useNativeDriver: true,
      overshootClamping: true,
    }).start();
  }, [panX]);

  const closeSwipe = useCallback(() => snapTo(0), [snapTo]);

  const triggerRegenerate = useCallback(() => {
    if (isRegenerating.current) return;
    isRegenerating.current = true;
    mediumImpact();
    onRegenerate();
    setTimeout(() => {
      isRegenerating.current = false;
    }, 2000);
  }, [onRegenerate]);

  const handleDelete = useCallback(() => {
    lightImpact();
    onDelete();
    closeSwipe();
  }, [onDelete, closeSwipe]);

  const panHandlers = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_ev: any, gestureState: any) => {
        const minDx = 25;
        const ratio = 3;
        if (currentX.current === 0) {
          return gestureState.dx < -minDx && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * ratio;
        }
        return Math.abs(gestureState.dx) > minDx && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * ratio;
      },
      onPanResponderGrant: () => { startX.current = currentX.current; },
      onPanResponderMove: (_ev: any, gestureState: any) => {
        const clamped = Math.min(Math.max(startX.current + gestureState.dx, -sidebarW), 0);
        currentX.current = clamped;
        panX.setValue(clamped);
      },
      onPanResponderRelease: () => {
        snapTo(currentX.current < -sidebarW / 2 ? -sidebarW : 0);
      },
    }),
  ).current;

  useEffect(() => {
    const id = panX.addListener(({ value }) => { currentX.current = value; });
    return () => panX.removeListener(id);
  }, [panX]);

  const messageContent = msg.senderType === 'narrator' ? (
    <View style={styles.narratorBlock}>
      <Text style={[styles.narratorText, { color: colors.text.narrator }]}>{msg.content}</Text>
    </View>
  ) : (
    <MessageItem
      senderType={msg.senderType}
      senderName={msg.senderName}
      senderAvatar={msg.senderAvatar}
      content={msg.content}
      isStreaming={isStreaming}
      colors={colors}
    />
  );

  return (
    <Animated.View style={[styles.swipeContainer, { opacity: fadeAnim }]}>
      <View style={[styles.sidebar, { right: 0, width: sidebarW, backgroundColor: isDark ? '#1A0A0A' : '#FFF3F3' }]}>
        <TouchableOpacity style={styles.sidebarBtn} onPress={triggerRegenerate}>
          <Text style={[styles.sidebarIcon, { color: isDark ? '#EF4444' : '#CC4444' }]}>↻</Text>
          <Text style={[styles.sidebarBtnText, { color: isDark ? '#EF4444' : '#CC4444' }]}>重新生成</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.sidebarBtn} onPress={handleDelete}>
          <Text style={[styles.sidebarIcon, styles.sidebarDeleteIcon, { color: isDark ? '#EF4444' : '#CC4444' }]}>🗑</Text>
          <Text style={[styles.sidebarBtnText, styles.sidebarDeleteText, { color: isDark ? '#F87171' : '#AA3333' }]}>删除</Text>
        </TouchableOpacity>
      </View>
      <Animated.View
        style={[styles.swipeContent, { backgroundColor: colors.background }, { transform: [{ translateX: panX }] }]}
        {...panHandlers.panHandlers}
      >
        {messageContent}
      </Animated.View>
    </Animated.View>
  );
}

function MessageItem({
  senderType,
  senderName,
  senderAvatar,
  content,
  isStreaming,
  colors,
}: {
  senderType: string;
  senderName: string;
  senderAvatar: string;
  content: string;
  isStreaming?: boolean;
  colors?: typeof import('../constants/theme').colors;
}) {
  if (senderType === 'narrator') {
    return (
      <View style={styles.narratorBlock}>
        <Text style={[styles.narratorText, colors && { color: colors.text.narrator }]}>{content}</Text>
      </View>
    );
  }

  const isImageAvatar = (senderAvatar || '').startsWith('file://') || (senderAvatar || '').startsWith('data:') || (senderAvatar || '').startsWith('http');

  return (
    <View style={[styles.messageBlock, isStreaming && styles.streamingBlock]}>
      <View style={styles.messageHeader}>
        {isImageAvatar ? (
          <Image source={{ uri: senderAvatar }} style={styles.messageAvatarImage} />
        ) : (
          <Text style={styles.messageAvatar}>{senderAvatar}</Text>
        )}
        <Text style={[styles.messageName, colors && { color: colors.text.primary }]}>{senderName}</Text>
        {isStreaming && <Text style={[styles.streamingDot, colors && { color: colors.text.primary }]}>●</Text>}
      </View>
      {isStreaming ? (
        <StreamingText text={content} colors={colors} />
      ) : (
        <Text style={[styles.messageContent, colors && { color: colors.text.primary }]}>{content}</Text>
      )}
    </View>
  );
}

function StreamingText({ text, colors: themeColors }: { text: string; colors?: typeof import('../constants/theme').colors }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const prevLength = useRef(0);

  useEffect(() => {
    if (text.length > prevLength.current && text.length > 0) {
      prevLength.current = text.length;
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 60, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: true }),
      ]).start();
    }
  }, [text, opacity]);

  return (
    <Animated.Text style={[styles.messageContent, themeColors && { color: themeColors.text.primary }, { opacity }]}>
      {text}
    </Animated.Text>
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
  stageName: {
    ...typography.heading,
    color: colors.text.primary,
  },
  stageNameBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  stageChevron: {
    ...typography.caption,
    color: colors.text.tertiary,
    fontSize: 12,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerIconBtn: {
    padding: spacing.xs,
  },
  headerIconText: {
    fontSize: 16,
  },
  streamingIndicator: {
    ...typography.caption,
    color: colors.text.tertiary,
  },
  autoPlayBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  autoPlayText: {
    ...typography.caption,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  footer: {},
  listContent: {
    paddingHorizontal: spacing.lg,
  },
  narratorBlock: {
    marginBottom: spacing.lg,
    paddingVertical: spacing.xs,
  },
  narratorText: {
    ...typography.script,
    color: colors.text.narrator,
    lineHeight: 24,
  },
  messageBlock: {
    marginBottom: spacing.lg,
  },
  streamingBlock: {
    opacity: 0.8,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  messageAvatar: {
    fontSize: 18,
    marginRight: spacing.xs,
  },
  messageAvatarImage: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: spacing.xs,
  },
  messageName: {
    ...typography.subheading,
    fontSize: 15,
    fontWeight: '500',
    color: colors.text.primary,
  },
  streamingDot: {
    color: colors.text.primary,
    marginLeft: spacing.xs,
    fontSize: 8,
  },
  messageContent: {
    ...typography.body,
    color: colors.text.primary,
    lineHeight: 24,
  },
  bottomSpacer: {
    height: spacing.xl,
  },
  speakerBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
  },
  speakerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speakerAvatarSelected: {},
  speakerEmoji: {
    fontSize: 18,
  },
  speakerAvatarImage: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  inputArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
    backgroundColor: colors.background,
  },
  identityBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityText: {
    fontSize: 18,
  },
  identityAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.text.primary,
    maxHeight: 100,
    paddingVertical: spacing.sm,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.text.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: colors.separator,
  },
  sendText: {
    fontSize: 24,
    color: '#FFFFFF',
    lineHeight: 24,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyText: {
    ...typography.subheading,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  emptyHint: {
    ...typography.caption,
    color: colors.text.tertiary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  loadingText: {
    ...typography.subheading,
    color: colors.text.tertiary,
  },
  emptyBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.text.primary,
    borderRadius: 8,
  },
  emptyBtnText: {
    ...typography.body,
    color: '#FFFFFF',
  },
  swipeContainer: {
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  swipeContent: {
    flex: 1,
    backgroundColor: colors.background,
    elevation: 1,
  },
  sidebar: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 140,
    backgroundColor: '#FFF3F3',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 0,
    gap: spacing.xs,
  },
  sidebarBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  sidebarIcon: {
    fontSize: 20,
    color: '#CC4444',
    marginBottom: 2,
  },
  sidebarDeleteIcon: {
    fontSize: 18,
  },
  sidebarBtnText: {
    fontSize: 11,
    color: '#CC4444',
    fontWeight: '500',
  },
  sidebarDeleteText: {
    color: '#AA3333',
  },
  branchDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.md,
    gap: spacing.sm,
  },
  branchDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.text.tertiary,
    opacity: 0.3,
  },
  branchDividerText: {
    ...typography.caption,
    color: colors.text.tertiary,
  },
  branchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
    backgroundColor: colors.background,
  },
  branchNavBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  branchNavText: {
    fontSize: 20,
    color: colors.text.secondary,
  },
  branchDots: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  branchDot: {
    padding: spacing.xs,
  },
  branchDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.text.tertiary,
  },
  branchDotActive: {
    backgroundColor: colors.text.primary,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
  },
  overlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  stageList: {
    position: 'absolute',
    top: 80,
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: spacing.md,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  stageListTitle: {
    ...typography.subheading,
    color: colors.text.tertiary,
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  stageListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
  },
  stageListItemActive: {
    backgroundColor: '#F5F5F5',
  },
  stageListItemText: {
    ...typography.body,
    color: colors.text.primary,
  },
  stageListItemTextActive: {
    fontWeight: '600',
  },
  stageListCheck: {
    fontSize: 16,
    color: colors.text.primary,
    fontWeight: '600',
  },
  stageListDeleteHint: {
    ...typography.caption,
    color: colors.text.tertiary,
    fontSize: 10,
  },
  stageListNewBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.text.primary,
    alignItems: 'center',
  },
  stageListNewText: {
    ...typography.body,
    color: colors.text.primary,
    fontWeight: '500',
  },
  debugPanel: {
    position: 'absolute',
    bottom: spacing.lg,
    left: spacing.lg,
    right: spacing.lg,
    maxHeight: '70%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: spacing.md,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  debugPanelTitle: {
    ...typography.subheading,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  debugPanelSubtitle: {
    ...typography.caption,
    color: colors.text.tertiary,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  debugScroll: {
    maxHeight: 300,
  },
  debugText: {
    ...typography.body,
    color: colors.text.primary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  debugBottomPadding: {
    height: spacing.sm,
  },
  debugCloseBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.text.primary,
    borderRadius: 8,
    alignItems: 'center',
  },
  debugCloseText: {
    ...typography.caption,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  debugEmptyText: {
    ...typography.caption,
    color: colors.text.tertiary,
    marginBottom: spacing.md,
  },
});
