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

const SIDEBAR_WIDTH = 120; // Width of action sidebar in px

export default function StageScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const messages = useStageStore((s) => s.messages);
  const characters = useStageStore((s) => s.characters);
  const stage = useStageStore((s) => s.stage);
  const isStreaming = useStageStore((s) => s.isStreaming);
  const streamingContent = useStageStore((s) => s.streamingContent);
  const currentSpeaker = useStageStore((s) => s.currentSpeaker);
  const activeBranchId = useStageStore((s) => s.activeBranchId);
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
  const getBranches = useStageStore((s) => s.getBranches);
  const archiveCharacters = useArchiveStore((s) => s.characters);

  const [inputText, setInputText] = useState('');
  const [identityMode, setIdentityMode] = useState<'narrator' | 'character' | 'guest'>('narrator');
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [showStageList, setShowStageList] = useState(false);
  const [allStages, setAllStages] = useState<Stage[]>([]);
  const flatListRef = useRef<FlatList>(null);

  // Immersive mode: hide header/input on scroll down, show on tap
  const headerAnim = useRef(new Animated.Value(0)).current; // 0 = visible, 1 = hidden
  const inputAnim = useRef(new Animated.Value(0)).current;
  const scrollOffset = useRef(0);
  const lastScrollY = useRef(0);
  const isImmersive = useRef(false);

  const HIDE_THRESHOLD = 60; // px of scroll before triggering hide

  const animateUI = useCallback((visible: boolean) => {
    const toValue = visible ? 0 : 1;
    Animated.parallel([
      Animated.timing(headerAnim, { toValue, duration: 250, useNativeDriver: true }),
      Animated.timing(inputAnim, { toValue, duration: 250, useNativeDriver: true }),
    ]).start();
    isImmersive.current = !visible;
  }, [headerAnim, inputAnim]);

  const handleScroll = useCallback((event: any) => {
    const currentY = event.nativeEvent.contentOffset.y;
    const dy = currentY - lastScrollY.current;

    if (dy > HIDE_THRESHOLD && !isImmersive.current) {
      animateUI(false);
    } else if (dy < -HIDE_THRESHOLD && isImmersive.current) {
      animateUI(true);
    }
    lastScrollY.current = currentY;
    scrollOffset.current = currentY;
  }, [animateUI]);

  const handleTapToReveal = useCallback(() => {
    if (isImmersive.current) {
      animateUI(true);
    }
  }, [animateUI]);

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
    // Reset identity and selected character
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

              // Refresh the list
              const remaining = await stageDao.getAllStages();
              setAllStages(remaining);

              // If deleted the current stage, reset
              if (stage?.id === s.id) {
                if (remaining.length > 0) {
                  await useStageStore.getState().selectStage(remaining[0].id);
                } else {
                  useStageStore.setState({ stage: null, messages: [], characters: [] });
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
            // Check DB for existing stages before creating new one
            const stageDao = await import('../services/db/stageDao');
            const existingStages = await stageDao.getAllStages();
            if (existingStages.length > 0) {
              console.log(`[Stage] Found ${existingStages.length} existing stage(s) in DB, loading first`);
              await useStageStore.getState().loadStage(existingStages[0].id);
            } else {
              console.log('[Stage] Creating new stage "第一幕"');
              await createStage('第一幕', ids);
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
  }, []);

  useEffect(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
  }, [messages, streamingContent]);

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
    // Select the character for future sends
    setSelectedCharacter(char);
    setIdentityMode('character');
    if (inputText.trim() && !isStreaming) {
      // If there's already text, send immediately as this character
      sendMessage(inputText.trim(), 'character', char.name, char.avatar, char.id);
      setInputText('');
    }
  };

  const handleAutoPlay = () => {
    if (!isStreaming) {
      mediumImpact();
      triggerAutoReply();
    }
  };

  // Filter messages by active branch
  const displayedMessages = activeBranchId
    ? messages.filter((m) => m.branchId === activeBranchId)
    : messages;

  // Branch switching
  const branches = getBranches();
  const branchIndicator = branches.length > 1 && activeBranchId
    ? (() => {
        const idx = branches.findIndex((b) => b.branchId === activeBranchId);
        return `${idx + 1}/${branches.length}`;
      })()
    : null;

  const handleBranchSwitch = (direction: 'left' | 'right') => {
    if (branches.length < 2) return;
    const activeIdx = branches.findIndex((b) => b.branchId === activeBranchId);
    let newIdx = direction === 'left' ? activeIdx + 1 : activeIdx - 1;
    if (newIdx < 0) newIdx = branches.length - 1;
    if (newIdx >= branches.length) newIdx = 0;
    switchBranch(branches[newIdx].branchId);
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
      // Fallback: show in alert for manual copy
      Alert.alert('导出', '已生成 Markdown 文档（长按可复制）', [
        { text: '好的' },
      ]);
      console.log(`[Stage::Export] Markdown generated (${md.length} chars)`);
    }
  };

  if (initializing) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.stageName}>舞台</Text>
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.loadingText}>初始化舞台...</Text>
        </View>
      </View>
    );
  }

  if (!stage || characters.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.stageName}>舞台</Text>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => (navigation as any).navigate('StageSetup')}>
            <Text style={styles.headerIconText}>+</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🎭</Text>
          <Text style={styles.emptyText}>暂无舞台</Text>
          <Text style={styles.emptyHint}>
            {archiveCharacters.length > 0
              ? '图鉴中已有角色，点击右上角 + 创建舞台开始推演。'
              : '请先在图鉴中创建角色，然后来这里开始推演。'}
          </Text>
          {archiveCharacters.length === 0 && (
            <TouchableOpacity style={styles.emptyBtn} onPress={() => (navigation as any).navigate('Archive')}>
              <Text style={styles.emptyBtnText}>前往图鉴</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <Animated.View
        style={[
          styles.header,
          {
            opacity: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
            transform: [
              { translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -60] }) },
            ],
            zIndex: 10,
          },
        ]}
        pointerEvents={isImmersive.current ? 'none' : 'auto'}
      >
        <TouchableOpacity style={styles.stageNameBtn} onPress={openStageSwitcher} onLongPress={() => setDebugVisible(true)} delayLongPress={500}>
          <Text style={styles.stageName}>{stage.name}</Text>
          <Text style={styles.stageChevron}>▾</Text>
        </TouchableOpacity>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => (navigation as any).navigate('StageSetup')}>
            <Text style={styles.headerIconText}>+</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIconBtn} onPress={handleExport}>
            <Text style={styles.headerIconText}>📋</Text>
          </TouchableOpacity>
          {isStreaming ? (
            <Text style={styles.streamingIndicator}>生成中...</Text>
          ) : (
            <TouchableOpacity style={styles.autoPlayBtn} onPress={handleAutoPlay}>
              <Text style={styles.autoPlayText}>▶ 自动推演</Text>
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>

      {/* API error banner */}
      {apiError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{apiError}</Text>
          <View style={styles.errorActions}>
            <TouchableOpacity
              onPress={() => { clearApiError(); triggerAutoReply(); }}
              style={styles.errorRetryBtn}
              disabled={isStreaming}
            >
              <Text style={styles.errorRetryText}>重试</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={clearApiError} style={styles.errorDismissBtn}>
              <Text style={styles.errorDismissText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Stage summary banner — auto-generated when history is truncated */}
      {stageSummary ? (
        <View style={styles.summaryBanner}>
          <Text style={styles.summaryIcon}>📖</Text>
          <Text style={styles.summaryText}>{stageSummary}</Text>
        </View>
      ) : null}

      <FlatList
        ref={flatListRef}
        data={displayedMessages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <SwipeableMessage
            msg={item}
            isStreaming={false}
            onRegenerate={() => regenerateMessage(item.id)}
            onDelete={() => deleteBranch(item.branchId, item.id)}
            onSwitchBranch={() => handleBranchSwitch('left')}
            hasMultipleBranches={branches.length > 1}
            branchIndicator={branchIndicator}
          />
        )}
        contentContainerStyle={styles.listContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onTouchEnd={handleTapToReveal}
        ListFooterComponent={
          streamingContent ? (
            <MessageItem
              senderType="character"
              senderName={currentSpeaker || ''}
              senderAvatar={characters.find((c) => c.name === currentSpeaker)?.avatar || '🎭'}
              content={streamingContent}
              isStreaming
            />
          ) : (
            <View style={styles.bottomSpacer} />
          )
        }
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      {/* Speaker quick-pick avatars */}
      <Animated.View
        style={[
          styles.speakerBar,
          {
            opacity: inputAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
            transform: [
              { translateY: inputAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 60] }) },
            ],
          },
        ]}
        pointerEvents={isImmersive.current ? 'none' : 'auto'}
      >
        {characters.map((c) => {
          const isSelected = selectedCharacter?.id === c.id;
          const isImage = (c.avatar || '').startsWith('file://') || (c.avatar || '').startsWith('data:') || (c.avatar || '').startsWith('http');
          return (
            <TouchableOpacity
              key={c.id}
              style={[styles.speakerAvatar, isSelected && styles.speakerAvatarSelected]}
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
      </Animated.View>

      {/* Identity switcher + input */}
      <Animated.View
        style={[
          styles.inputArea,
          {
            opacity: inputAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
            transform: [
              { translateY: inputAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 60] }) },
            ],
          },
        ]}
        pointerEvents={isImmersive.current ? 'none' : 'auto'}
      >
        <TouchableOpacity
          style={styles.identityBtn}
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
          style={styles.input}
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
          style={[styles.sendBtn, (!inputText.trim() || isStreaming) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim() || isStreaming}
        >
          <Text style={styles.sendText}>›</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Worldline branch indicator */}
      {branches.length > 0 && (
        <Animated.View
          style={[
            styles.branchBar,
            {
              opacity: inputAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
              transform: [
                { translateY: inputAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 40] }) },
              ],
            },
          ]}
          pointerEvents={isImmersive.current ? 'none' : 'auto'}
          onStartShouldSetResponder={() => true}
        >
          <TouchableOpacity
            style={styles.branchNavBtn}
            onPress={() => handleBranchSwitch('left')}
          >
            <Text style={styles.branchNavText}>‹</Text>
          </TouchableOpacity>
          <View style={styles.branchDots}>
            {branches.map((b) => (
              <TouchableOpacity
                key={b.branchId}
                style={styles.branchDot}
                onPress={() => switchBranch(b.branchId)}
              >
                <View
                  style={[
                    styles.branchDotInner,
                    b.branchId === activeBranchId && styles.branchDotActive,
                  ]}
                />
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={styles.branchNavBtn}
            onPress={() => handleBranchSwitch('right')}
          >
            <Text style={styles.branchNavText}>›</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Stage switcher overlay */}
      {showStageList && (
        <View style={styles.overlay}>
          <TouchableOpacity style={styles.overlayBackdrop} onPress={() => setShowStageList(false)} activeOpacity={1} />
          <View style={styles.stageList}>
            <Text style={styles.stageListTitle}>切换舞台</Text>
            {allStages.map((s) => (
              <TouchableOpacity
                key={s.id}
                style={[styles.stageListItem, s.id === stage?.id && styles.stageListItemActive]}
                onPress={() => handleStageSelect(s.id)}
                onLongPress={() => handleDeleteStage(s)}
                delayLongPress={500}
              >
                <Text style={[styles.stageListItemText, s.id === stage?.id && styles.stageListItemTextActive]}>
                  {s.name}
                </Text>
                {s.id === stage?.id ? (
                  <Text style={styles.stageListCheck}>✓</Text>
                ) : (
                  <Text style={styles.stageListDeleteHint}>长按删除</Text>
                )}
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.stageListNewBtn}
              onPress={() => {
                setShowStageList(false);
                (navigation as any).navigate('StageSetup');
              }}
            >
              <Text style={styles.stageListNewText}>+ 新建舞台</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Debug prompt inspector — long-press stage name to open */}
      {debugVisible && lastPrompt && (
        <View style={styles.overlay}>
          <TouchableOpacity style={styles.overlayBackdrop} onPress={() => setDebugVisible(false)} activeOpacity={1} />
          <View style={styles.debugPanel}>
            <Text style={styles.debugPanelTitle}>🔍 提示词调试</Text>
            <Text style={styles.debugPanelSubtitle}>System Prompt</Text>
            <ScrollView style={styles.debugScroll} showsVerticalScrollIndicator>
              <Text style={styles.debugText}>{lastPrompt.system}</Text>
              <Text style={styles.debugPanelSubtitle}>API Messages</Text>
              <Text style={styles.debugText}>{lastPrompt.messages}</Text>
              <View style={styles.debugBottomPadding} />
            </ScrollView>
            <TouchableOpacity style={styles.debugCloseBtn} onPress={() => setDebugVisible(false)}>
              <Text style={styles.debugCloseText}>关闭</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {debugVisible && !lastPrompt && (
        <View style={styles.overlay}>
          <TouchableOpacity style={styles.overlayBackdrop} onPress={() => setDebugVisible(false)} activeOpacity={1} />
          <View style={styles.debugPanel}>
            <Text style={styles.debugPanelTitle}>🔍 提示词调试</Text>
            <Text style={styles.debugEmptyText}>暂无历史 — 请先触发一次角色发言</Text>
            <TouchableOpacity style={styles.debugCloseBtn} onPress={() => setDebugVisible(false)}>
              <Text style={styles.debugCloseText}>关闭</Text>
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
  onRegenerate,
  onDelete,
  onSwitchBranch,
  hasMultipleBranches,
  branchIndicator,
}: {
  msg: ChatMessage;
  isStreaming: boolean;
  onRegenerate: () => void;
  onDelete: () => void;
  onSwitchBranch: () => void;
  hasMultipleBranches: boolean;
  branchIndicator: string | null;
}) {
  const panX = useRef(new Animated.Value(0)).current;
  const isRegenerating = useRef(false);
  const currentX = useRef(0);
  const startX = useRef(0);
  const sidebarW = 140;

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

  const handleSwitch = useCallback(() => {
    selection();
    onSwitchBranch();
    closeSwipe();
  }, [onSwitchBranch, closeSwipe]);

  const panHandlers = useRef(
    PanResponder.create({
      // Always return false — never compete with FlatList on touch start.
      // Only claim the gesture during move phase after direction is clear.
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Require substantial horizontal movement AND a clear horizontal-dominant ratio.
        // This prevents any vertical scroll (even with slight horizontal jitter) from
        // being intercepted. Thresholds tuned to be noticeably higher than normal scroll drift.
        const minDx = 25;
        const ratio = 3; // horizontal must exceed vertical × 3
        if (currentX.current === 0) {
          // Sidebar closed: only allow leftward swipe
          return (
            gestureState.dx < -minDx &&
            Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * ratio
          );
        }
        // Sidebar open: allow both directions to close / interact with buttons
        return (
          Math.abs(gestureState.dx) > minDx &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * ratio
        );
      },
      onPanResponderGrant: () => {
        startX.current = currentX.current;
      },
      onPanResponderMove: (_, gestureState) => {
        const newValue = startX.current + gestureState.dx;
        const clamped = Math.min(Math.max(newValue, -sidebarW), 0);
        currentX.current = clamped;
        panX.setValue(clamped);
      },
      onPanResponderRelease: () => {
        if (currentX.current < -sidebarW / 2) {
          snapTo(-sidebarW);
        } else {
          snapTo(0);
        }
      },
    }),
  ).current;

  useEffect(() => {
    const id = panX.addListener(({ value }) => {
      currentX.current = value;
    });
    return () => panX.removeListener(id);
  }, [panX]);

  const messageContent = msg.senderType === 'narrator' ? (
    <View style={styles.narratorBlock}>
      <Text style={styles.narratorText}>{msg.content}</Text>
    </View>
  ) : (
    <MessageItem
      senderType={msg.senderType}
      senderName={msg.senderName}
      senderAvatar={msg.senderAvatar}
      content={msg.content}
      isStreaming={isStreaming}
    />
  );

  return (
    <View style={styles.swipeContainer}>
      {/* Sidebar — fixed on the right, visible when content slides left */}
      <View style={[styles.sidebar, { right: 0, width: sidebarW }]}>
        {hasMultipleBranches && (
          <TouchableOpacity style={styles.sidebarBtn} onPress={handleSwitch}>
            <Text style={styles.sidebarIcon}>⇄</Text>
            <Text style={styles.sidebarBtnText}>{branchIndicator || '切换'}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.sidebarBtn} onPress={triggerRegenerate}>
          <Text style={styles.sidebarIcon}>↻</Text>
          <Text style={styles.sidebarBtnText}>重新生成</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.sidebarBtn} onPress={handleDelete}>
          <Text style={[styles.sidebarIcon, styles.sidebarDeleteIcon]}>🗑</Text>
          <Text style={[styles.sidebarBtnText, styles.sidebarDeleteText]}>删除</Text>
        </TouchableOpacity>
      </View>
      {/* Content — slides left to reveal sidebar */}
      <Animated.View
        style={[styles.swipeContent, { transform: [{ translateX: panX }] }]}
        {...panHandlers.panHandlers}
      >
        {messageContent}
      </Animated.View>
    </View>
  );
}

function MessageItem({
  senderType,
  senderName,
  senderAvatar,
  content,
  isStreaming,
}: {
  senderType: string;
  senderName: string;
  senderAvatar: string;
  content: string;
  isStreaming?: boolean;
}) {
  if (senderType === 'narrator') {
    return (
      <View style={styles.narratorBlock}>
        <Text style={styles.narratorText}>{content}</Text>
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
        <Text style={styles.messageName}>{senderName}</Text>
        {isStreaming && <Text style={styles.streamingDot}>●</Text>}
      </View>
      {isStreaming ? (
        <StreamingText text={content} />
      ) : (
        <Text style={styles.messageContent}>{content}</Text>
      )}
    </View>
  );
}

/**
 * Renders text with a smooth character-by-character reveal animation.
 * New characters fade in one at a time as content arrives.
 */
function StreamingText({ text }: { text: string }) {
  const { colors } = useTheme();
  const [revealedCount, setRevealedCount] = useState(0);
  const animRefs = useRef<Map<number, Animated.Value>>(new Map());

  // Track new characters and animate them in
  useEffect(() => {
    if (text.length === 0) return;

    // Reveal all characters that have arrived
    const targetCount = text.length;
    if (revealedCount < targetCount) {
      // Animate each new character
      for (let i = revealedCount; i < targetCount; i++) {
        if (!animRefs.current.has(i)) {
          const anim = new Animated.Value(0);
          animRefs.current.set(i, anim);
          Animated.timing(anim, {
            toValue: 1,
            duration: 80,
            useNativeDriver: true,
          }).start();
        }
      }
      setRevealedCount(targetCount);
    }
  }, [text, revealedCount]);

  // Render revealed characters with their individual animations
  const chars = text.slice(0, revealedCount);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {chars.split('').map((char, i) => {
        const anim = animRefs.current.get(i);
        if (!anim) {
          // Already fully revealed, render as plain text
          return <Text key={i} style={styles.messageContent}>{char}</Text>;
        }
        return (
          <Animated.Text
            key={i}
            style={[
              styles.messageContent,
              {
                opacity: anim,
                transform: [
                  { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) },
                ],
              },
            ]}
          >
            {char}
          </Animated.Text>
        );
      })}
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
  // API error banner
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3F3',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  // Stage summary banner
  summaryBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  summaryIcon: {
    fontSize: 14,
    marginTop: 2,
  },
  summaryText: {
    flex: 1,
    ...typography.caption,
    color: colors.text.secondary,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  errorBannerText: {
    flex: 1,
    ...typography.caption,
    color: '#CC4444',
    lineHeight: 18,
  },
  errorActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  errorRetryBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: '#CC4444',
    borderRadius: 6,
  },
  errorRetryText: {
    ...typography.caption,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  errorDismissBtn: {
    padding: spacing.xs,
  },
  errorDismissText: {
    fontSize: 14,
    color: '#CC4444',
  },
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
  speakerAvatarSelected: {
    borderWidth: 2,
    borderColor: colors.text.primary,
    backgroundColor: colors.text.primary,
  },
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
  // Swipe / regenerate
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
  // Branch indicator
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
  // Stage switcher overlay
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
  // Debug prompt inspector
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
