/**
 * CK-09 visual-fixture surfaces (ui-10–ui-18). Layout mirrors app-development/UI/reference.
 */
import type { ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";

import {
  inferUserModeProfileFromDialogue,
  observeWorldHeadlines,
  WORLD_OBSERVER_FIXTURE_HEADLINES,
} from "@my-brain/core";

import { useTheme } from "../../theme/ThemeProvider";
import { shadows } from "../../theme/tokens";

/** Reference palette — matches app-development/UI/reference/tokens.ts */
const C = {
  background: "#14161C",
  surface: "#1E2129",
  surfaceMuted: "#252932",
  primary: "#7B8CFF",
  primarySoft: "#7B8CFF22",
  accent: "#FF8A7A",
  text: "#F4F2EF",
  muted: "#9BA3B4",
  tertiary: "#6B7280",
  border: "#FFFFFF12",
  success: "#6BC9A8",
  warning: "#E8B86D",
  learner: "#9B8CFF",
  tech: "#6B9FFF",
  memory: "#FF9EC4",
} as const;

function RefAccentLabel({ label, color = C.primary }: { label: string; color?: string }) {
  return (
    <Text style={[{ includeFontPadding: false }, refStyles.accentLabel, { color }]}>
      {label}
    </Text>
  );
}

function FixtureBackdrop() {
  return (
    <View style={refStyles.backdropLayer} pointerEvents="none">
      <View style={refStyles.bgGlowPrimary} />
      <View style={refStyles.bgGlowPrimaryOuter} />
      <View style={refStyles.bgGlowWarm} />
      <View style={refStyles.bgGlowWarmOuter} />
    </View>
  );
}

type PillSize = "compact" | "small" | "profile" | "mid" | "action";

function RefPill({
  label,
  active = false,
  accent = false,
  muted = false,
  size = "compact",
  width,
  testID,
}: {
  label: string;
  active?: boolean;
  accent?: boolean;
  muted?: boolean;
  size?: PillSize;
  width?: number;
  testID?: string;
}) {
  const sizeStyle =
    size === "action"
      ? refStyles.pillAction
      : size === "mid"
        ? refStyles.pillMid
        : size === "small"
          ? refStyles.pillSmall
          : size === "profile"
            ? refStyles.pillProfile
            : refStyles.pillCompact;
  return (
    <Pressable
      testID={testID}
      style={[
        sizeStyle,
        width != null ? { width, minWidth: width } : null,
        active && !accent && refStyles.pillActive,
        active && accent && refStyles.pillAccentActive,
      ]}
    >
      <Text
        style={[{ includeFontPadding: false }, 
          refStyles.pillText,
          muted && !active && refStyles.pillTextMuted,
          active && !accent && refStyles.pillTextActive,
          active && accent && refStyles.pillTextAccentActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function RefPillRowSpread({
  pills,
  size = "mid",
  topGap = 16,
}: {
  pills: Array<{
    label: string;
    active?: boolean;
    accent?: boolean;
    muted?: boolean;
    width: number;
    testID?: string;
  }>;
  size?: PillSize;
  topGap?: number;
}) {
  return (
    <View style={[refStyles.pillRowSpread, { marginTop: topGap }]}>
      {pills.map((pill) => (
        <RefPill key={pill.label} {...pill} size={size} />
      ))}
    </View>
  );
}

function RefPrimaryButton({ label, testID, fullWidth = false }: { label: string; testID?: string; fullWidth?: boolean }) {
  return (
    <Pressable
      style={[refStyles.primaryButton, fullWidth && refStyles.primaryButtonFull]}
      testID={testID}
    >
      <Text style={refStyles.primaryButtonText}>
        {label}
      </Text>
    </Pressable>
  );
}

function RefCard({
  children,
  muted = false,
  style,
}: {
  children: ReactNode;
  muted?: boolean;
  style?: ViewStyle;
}) {
  return (
    <View style={[refStyles.card, refStyles.cardShadow, muted && refStyles.cardMuted, style]}>
      {children}
    </View>
  );
}

function RefNavHeader({
  title,
  subtitle,
  showBack = true,
}: {
  title: string;
  subtitle?: string;
  showBack?: boolean;
}) {
  return (
    <View style={refStyles.headerBlock}>
      {showBack ? (
        <View style={refStyles.navRow}>
          <View style={refStyles.backCircle}>
            <Text style={refStyles.backGlyph}>
              ‹
            </Text>
          </View>
          <Text style={refStyles.title}>
            {title}
          </Text>
        </View>
      ) : (
        <Text style={refStyles.title}>
          {title}
        </Text>
      )}
      {subtitle ? (
        <Text style={refStyles.subtitle}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

function RefScaffold({
  title,
  subtitle,
  testID,
  children,
  footer,
  scroll = true,
  showBack = true,
}: {
  title: string;
  subtitle?: string;
  testID: string;
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  showBack?: boolean;
}) {
  useTheme();
  const body = scroll ? (
    <ScrollView
      style={refStyles.flexScroll}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={refStyles.scrollContent}
    >
      {children}
    </ScrollView>
  ) : (
    <>
      <View style={refStyles.flexScroll}>{children}</View>
      {footer ? <View style={refStyles.footerDock}>{footer}</View> : null}
    </>
  );
  return (
    <View style={refStyles.screen} testID={testID}>
      <FixtureBackdrop />
      <RefNavHeader title={title} subtitle={subtitle} showBack={showBack} />
      {body}
    </View>
  );
}

export function ColdStartDialogueFixtureScreen() {
  return (
    <RefScaffold
      title="先聊几句"
      subtitle="不用选类别，我会从你的话里理解怎么陪你。"
      testID="screen-cold-start"
      scroll={false}
      footer={
        <>
          <View style={refStyles.inputRow}>
            <TextInput
              placeholder="说说你今天想怎么用这个 App…"
              placeholderTextColor={C.tertiary}
              style={[refStyles.input, refStyles.inputInline]}
              testID="cold-start-fixture-input"
            />
            <Pressable style={refStyles.sendButton} testID="cold-start-fixture-send">
              <Text style={refStyles.sendButtonText}>
                发送
              </Text>
            </Pressable>
          </View>
          <Pressable style={refStyles.enterButton} testID="cold-start-fixture-enter">
            <Text style={refStyles.primaryButtonText}>
              进入我的大脑
            </Text>
          </Pressable>
        </>
      }
    >
      <RefCard>
        <Text style={refStyles.bubbleText}>
          你更希望我帮你做什么？{"\n"}随便说，不用选类别。
        </Text>
      </RefCard>
      <View style={refStyles.userWrap}>
        <RefCard style={refStyles.userCard}>
          <Text style={[{ includeFontPadding: false }, refStyles.bubbleText, refStyles.userBubbleText]}>
            我想系统学一下 AI 语音相关的东西，{"\n"}顺便把项目想法记下来。
          </Text>
        </RefCard>
      </View>
      <RefCard>
        <Text style={refStyles.bubbleText}>
          听起来你是「学习者 + 技术追踪者」向。{"\n"}我会按这个方式陪你，第一颗星会来自你的话。
        </Text>
      </RefCard>
      <RefCard muted style={refStyles.inferenceCard}>
        <RefAccentLabel label="识别结果 · 可纠偏" color={C.learner} />
        <Text style={refStyles.cardTitle}>
          学习者 + 技术追踪者 · 置信 82%
        </Text>
        <Text style={refStyles.captionSmall}>
          进入首页后可在「我的画像」里修正。
        </Text>
      </RefCard>
    </RefScaffold>
  );
}

export function ProviderSettingsFixtureScreen() {
  return (
    <RefScaffold
      title="连接与模型"
      subtitle="密钥只存本机；未测试成功前不会显示为已连接。"
      testID="screen-provider-settings"
      scroll={false}
      footer={
        <RefPrimaryButton label="保存设置" testID="provider-fixture-save" fullWidth />
      }
    >
      <ScrollView showsVerticalScrollIndicator={false} style={refStyles.flexScroll} contentContainerStyle={refStyles.scrollContentTight}>
        <RefCard style={refStyles.warningCard}>
          <RefAccentLabel label="首启门禁 · 未连通前不进入冷启动" color={C.warning} />
          <Text style={refStyles.captionSmall}>
            本机直连豆包；Key 只存本机。
          </Text>
        </RefCard>
        <ProviderBlock
          label="LLM 模型"
          value="sk-········4f2a"
          hint="用于讲细点、整理建议"
          accent={C.primary}
          active
        />
        <ProviderBlock
          label="语音模型"
          value="sk-········9b1c"
          hint="用于实时语音伴侣；支持打断"
          accent={C.tech}
        />
        <RefCard>
          <RefAccentLabel label="连接检测" color={C.success} />
          <Text style={refStyles.captionSmall}>
            LLM 与语音都通过后，才开始真实冷启动。
          </Text>
          <Text style={refStyles.captionSmall}>
            上次测试：未执行 · 请先验证
          </Text>
        </RefCard>
        <RefCard muted>
          <RefAccentLabel label="当前范围" color={C.tertiary} />
          <Text style={refStyles.captionSmall}>
            个人自用，直接配置 Key；失败就停在这里。
          </Text>
        </RefCard>
      </ScrollView>
    </RefScaffold>
  );
}

function ProviderBlock({
  label,
  value,
  hint,
  accent,
  active = false,
}: {
  label: string;
  value: string;
  hint: string;
  accent: string;
  active?: boolean;
}) {
  return (
    <RefCard>
      <RefAccentLabel label={label} color={accent} />
      <TextInput
        value={value}
        editable={false}
        style={refStyles.input}
        placeholderTextColor={C.tertiary}
      />
      <View style={refStyles.hintTestRow}>
        <Text style={refStyles.hintTestLabel}>
          {hint}
        </Text>
        <RefPill label="测试连接" active={active} size="small" width={110} />
      </View>
    </RefCard>
  );
}

export function VoiceSessionFixtureScreen() {
  return (
    <RefScaffold
      title="语音伴侣"
      subtitle="豆包语音大模型；可随时打断，也可文字兜底。"
      testID="screen-voice-session"
      scroll={false}
      showBack={false}
      footer={
        <RefPillRowSpread
          topGap={0}
          size="action"
          pills={[
            { label: "记住这条", active: true, width: 114 },
            { label: "先不用", width: 104 },
            { label: "多说点", width: 114 },
          ]}
        />
      }
    >
      <ScrollView showsVerticalScrollIndicator={false} style={refStyles.flexScroll} contentContainerStyle={refStyles.scrollContent}>
      <RefCard style={refStyles.liveCard}>
        <RefAccentLabel label="Live 语音 · 正在聆听" color={C.success} />
      </RefCard>
      <View style={refStyles.orbWrap} testID="voice-session-orb">
        <View style={refStyles.orbOuter} />
        <View style={refStyles.orbMid} />
        <View style={refStyles.orbCore} />
        <View style={refStyles.waveRow}>
          {[28, 52, 76, 52, 28].map((h, i) => (
            <View key={i} style={[refStyles.waveBar, { height: h, opacity: h === 76 ? 1 : h === 52 ? 0.95 : 0.85 }]} />
          ))}
        </View>
      </View>
      <Text style={refStyles.hero}>
        正在听你说
      </Text>
      <Text style={refStyles.heroBody}>
        插话会立即停止播放并重新聆听
      </Text>
      <RefCard>
        <Text style={refStyles.captionSmall}>
          刚才识别到
        </Text>
        <Text style={refStyles.cardTitle}>
          「这条先记住，晚点再整理」
        </Text>
        <Text style={refStyles.captionSmall}>
          意图：入库候选 · 仍需你确认
        </Text>
      </RefCard>
      <RefPillRowSpread
        topGap={24}
        pills={[
          { label: "打断", active: true, accent: true, width: 108, testID: "voice-barge-in" },
          { label: "文字输入", width: 108 },
          { label: "结束", width: 106, muted: true },
        ]}
      />
      </ScrollView>
    </RefScaffold>
  );
}

export function CompanionChatFixtureScreen() {
  return (
    <RefScaffold
      title="陪你聊会儿"
      subtitle="闲聊默认不入库；你说记下来才生成候选。"
      testID="screen-companion-chat"
      scroll={false}
      footer={
        <TextInput
          placeholder="随便说，我会先陪你把话说完…"
          placeholderTextColor={C.tertiary}
          style={[refStyles.input, refStyles.chatInputDock]}
          testID="companion-chat-input"
        />
      }
    >
      <ScrollView showsVerticalScrollIndicator={false} style={refStyles.flexScroll} contentContainerStyle={refStyles.scrollContent}>
      <RefCard>
        <Text style={refStyles.bubbleText}>
          今天不聊知识也行，我在。
        </Text>
      </RefCard>
      <View style={refStyles.userWrap}>
        <RefCard style={refStyles.userCard}>
          <Text style={[{ includeFontPadding: false }, refStyles.bubbleText, refStyles.userBubbleText]}>
            最近有点焦虑，项目推进得慢。
          </Text>
        </RefCard>
      </View>
      <RefCard>
        <Text style={refStyles.bubbleText}>
          我听到了。我们可以先把压力拆小一点，也可以只聊聊，不记录任何东西。
        </Text>
      </RefCard>
      <RefCard muted style={refStyles.contextCard}>
        <RefAccentLabel label="短期上下文" color={C.accent} />
        <Text style={refStyles.cardTitle}>
          本轮只是陪聊，不写入永久图谱
        </Text>
        <Text style={refStyles.caption}>
          如果你说「这个记下来」，才会出现资产候选。
        </Text>
      </RefCard>
      <RefPillRowSpread
        topGap={24}
        pills={[
          { label: "继续聊", active: true, width: 106 },
          { label: "记下来", width: 106 },
          { label: "别记录", active: true, accent: true, width: 110 },
        ]}
      />
      </ScrollView>
    </RefScaffold>
  );
}

export function ProfileReviewFixtureScreen() {
  const traits = [
    { title: "偏好系统学习 + 项目实践", source: "从对话推断", accent: C.learner, action: "这不是我", active: true },
    { title: "关注 AI / 开源趋势", source: "从你的使用习惯", accent: C.tech, action: "这不是我" },
    { title: "偶尔记录生活想法（已隐藏）", source: "从对话推断", accent: C.memory, action: "恢复", active: true, muted: true },
  ];
  return (
    <RefScaffold
      title="我的画像"
      subtitle="你手动纠偏优先；被否定的推断不会立刻推回。"
      testID="screen-profile-review"
    >
      <RefCard>
        <RefAccentLabel label="主模式" color={C.learner} />
        <Text style={refStyles.cardTitle}>
          学习者 + 技术追踪者
        </Text>
        <Text style={refStyles.caption}>
          置信 82% · 最近纠偏：2 天前
        </Text>
      </RefCard>
      {traits.map((trait) => (
        <RefCard key={trait.title} muted={trait.muted}>
          <View style={refStyles.traitRow}>
            <View style={[refStyles.accentBar, { backgroundColor: trait.accent }]} />
            <View style={refStyles.traitBody}>
              <Text style={refStyles.cardTitle}>
                {trait.title}
              </Text>
              <Text style={refStyles.caption}>
                来源：{trait.source}
              </Text>
            </View>
            <RefPill label={trait.action} active={trait.active} />
          </View>
        </RefCard>
      ))}
      <RefCard>
        <RefAccentLabel label="纠偏历史" color={C.tertiary} />
        <Text style={refStyles.caption}>
          已隐藏「偶尔记录生活想法」
        </Text>
        <Text style={refStyles.caption}>
          已手动修正「偏好系统学习 + 项目实践」
        </Text>
        <Text style={refStyles.caption}>
          已恢复「关注 AI / 开源趋势」
        </Text>
      </RefCard>
      <RefPrimaryButton label="保存并刷新 Today" testID="profile-review-save" />
      <Text style={refStyles.footer}>
        画像静默生长，但你永远可以查看和改
      </Text>
    </RefScaffold>
  );
}

const WORLD_OBSERVER_FIXTURE_PROFILE = inferUserModeProfileFromDialogue(
  ["豆包语音接入", "barge-in", "Realtime transport"],
  "cold-tech-tracker",
);

const WORLD_OBSERVER_FIXTURE_UI = [
  { color: C.tech, action: "讲给我", active: true },
  { color: C.warning, action: "先放着" },
  { color: C.learner, action: "变候选" },
] as const;

export function WorldObserverFixtureScreen() {
  const observations = observeWorldHeadlines(
    WORLD_OBSERVER_FIXTURE_HEADLINES,
    WORLD_OBSERVER_FIXTURE_PROFILE,
    "2026-06-21T08:12:00.000Z",
  );
  const items = observations.map(({ item, signal }, index) => {
    const ui = WORLD_OBSERVER_FIXTURE_UI[index] ?? WORLD_OBSERVER_FIXTURE_UI[0];
    return {
      label: item.source,
      title: item.title,
      body: signal.whyUsefulToUser,
      color: ui.color,
      action: ui.action,
      active: "active" in ui && ui.active,
    };
  });
  return (
    <RefScaffold
      title="世界观察"
      subtitle="外部信息先是 WorldItem，不会自动入库。"
      testID="screen-world-observer"
      showBack={false}
      scroll={false}
      footer={
        <RefPillRowSpread
          topGap={0}
          size="action"
          pills={[
            { label: "讲细点", active: true, width: 114 },
            { label: "忽略", width: 104 },
            { label: "变候选", width: 114 },
          ]}
        />
      }
    >
      <ScrollView showsVerticalScrollIndicator={false} style={refStyles.flexScroll} contentContainerStyle={refStyles.scrollContent}>
      {items.map((item) => (
        <RefCard key={item.title} style={refStyles.worldItemCard}>
          <RefAccentLabel label={item.label} color={item.color} />
          <Text style={refStyles.cardTitle}>
            {item.title}
          </Text>
          <Text style={refStyles.caption}>
            {item.body}
          </Text>
          <View style={refStyles.cardPillEnd}>
            <View style={refStyles.pillWrapEnd}>
              <RefPill label={item.action} active={item.active} />
            </View>
          </View>
        </RefCard>
      ))}
      <RefCard muted>
        <RefAccentLabel label="为什么不是固定 Top3" color={C.primary} />
        <Text style={refStyles.caption}>
          候选由画像、项目、反复问题共同排序。
        </Text>
        <Text style={refStyles.caption}>
          没有用户画像时，本页不会出现。
        </Text>
      </RefCard>
      </ScrollView>
    </RefScaffold>
  );
}

export function PersonalObserverFixtureScreen() {
  const signals = [
    { label: "反复问题", title: "你最近 3 次问到 voice provider", body: "建议：今天用 30 秒帮你串起来。", color: C.learner },
    { label: "项目进展", title: "移动端主线切到陪伴型 OS", body: "下一步：冷启动与闲聊边界优先。", color: C.success },
    { label: "兴趣变化", title: "从「资讯雷达」转向「长期陪伴」", body: "需要更新每日入口排序。", color: C.memory },
  ];
  return (
    <RefScaffold
      title="你的变化"
      subtitle="我观察你的学习、项目、兴趣和理解变化。"
      testID="screen-personal-observer"
      showBack={false}
    >
      {signals.map((signal) => (
        <RefCard key={signal.title}>
          <RefAccentLabel label={signal.label} color={signal.color} />
          <Text style={refStyles.cardTitle}>
            {signal.title}
          </Text>
          <Text style={refStyles.caption}>
            {signal.body}
          </Text>
        </RefCard>
      ))}
      <RefCard muted style={refStyles.profileCandidateCard}>
        <RefAccentLabel label="可纠偏的画像候选" color={C.primary} />
        <Text style={refStyles.cardTitle}>
          偏好：先听我把话说完，再给建议
        </Text>
        <Text style={refStyles.caption}>
          来源：最近 2 次闲聊；未确认前不写长期画像。
        </Text>
        <View style={refStyles.pillRowCenter}>
          <RefPill label="确认" active size="profile" width={92} />
          <RefPill label="不对" active accent size="profile" width={92} />
          <RefPill label="以后再说" size="profile" width={92} />
        </View>
      </RefCard>
      <Text style={refStyles.footer}>
        用户手动纠偏优先于所有推断
      </Text>
    </RefScaffold>
  );
}

export function AssetCandidateFixtureScreen() {
  return (
    <RefScaffold
      title="变成长期资产？"
      subtitle="用户确认前，只是候选，不写永久图谱。"
      testID="screen-asset-candidate"
      showBack={false}
      scroll={false}
      footer={
        <RefPillRowSpread
          topGap={0}
          size="action"
          pills={[
            { label: "入库", active: true, width: 114 },
            { label: "不要", width: 104 },
            { label: "改一下", width: 114 },
          ]}
        />
      }
    >
      <ScrollView showsVerticalScrollIndicator={false} style={refStyles.flexScroll} contentContainerStyle={refStyles.scrollContent}>
      <RefCard>
        <RefAccentLabel label="候选类型 · Project" color={C.primary} />
        <Text style={refStyles.heroAsset}>
          陪伴型知识 OS
        </Text>
        <Text style={refStyles.caption}>
          来自刚才聊天：你决定把主线从雷达 App 调整为长期陪伴 OS。
        </Text>
      </RefCard>
      <RefCard muted>
        <RefAccentLabel label="建议关系" color={C.warning} />
        <Text style={refStyles.caption}>
          relates_to：豆包语音接入
        </Text>
        <Text style={refStyles.caption}>
          explains：闲聊不入库边界
        </Text>
      </RefCard>
      <RefCard>
        <RefAccentLabel label="整理动作 · 入库后才执行" color={C.success} />
        <Text style={refStyles.caption}>
          自动 link 到 VoiceProvider、ColdStartProfile。
        </Text>
        <Text style={refStyles.caption}>
          生成 history，可一键 undo。
        </Text>
      </RefCard>
      <RefCard style={refStyles.warningCard}>
        <Text style={refStyles.caption}>
          不会保存原始闲聊全文；只保存你确认的资产摘要。
        </Text>
        <Text style={refStyles.caption}>
          如果你点「不要」，候选会消失。
        </Text>
      </RefCard>
      </ScrollView>
    </RefScaffold>
  );
}

export function ReviewActionFixtureScreen() {
  return (
    <RefScaffold
      title="本周回顾"
      subtitle="只生成建议和草稿，不自动外部写入。"
      testID="screen-review-action"
      showBack={false}
    >
      <RefCard>
        <RefAccentLabel label="Weekly Brain Review" color={C.primary} />
        <Text style={refStyles.cardTitle}>
          你这周真正推进的是「陪伴型 OS」
        </Text>
        <Text style={refStyles.caption}>
          新增 5 个概念、2 个项目决策、1 个反复问题。
        </Text>
        <Text style={refStyles.caption}>
          薄弱点：真实冷启动画像还没有闭环。
        </Text>
      </RefCard>
      <RefCard>
        <RefAccentLabel label="Learning Coach" color={C.learner} />
        <Text style={refStyles.cardTitle}>
          要不要我考你 3 个问题？
        </Text>
        <Text style={refStyles.caption}>
          围绕 VoiceProvider、入库门控、画像纠偏。
        </Text>
      </RefCard>
      <RefCard>
        <RefAccentLabel label="Project Mode" color={C.success} />
        <Text style={refStyles.cardTitle}>
          下一步建议：先做首启门禁
        </Text>
        <Text style={refStyles.caption}>
          引用：Provider Setup、ColdStartProfile。
        </Text>
      </RefCard>
      <RefCard muted>
        <RefAccentLabel label="草稿边界" color={C.warning} />
        <Text style={refStyles.caption}>
          可以生成 issue / README / 博客草稿。
        </Text>
        <Text style={refStyles.caption}>
          不会自动发布，也不会自动创建 GitHub issue。
        </Text>
      </RefCard>
      <RefPillRowSpread
        topGap={28}
        pills={[
          { label: "生成草稿", active: true, width: 108 },
          { label: "考考我", width: 108 },
          { label: "保存建议", width: 106 },
        ]}
      />
    </RefScaffold>
  );
}

const refStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.background,
    paddingHorizontal: 20,
    paddingTop: 8,
    overflow: "hidden",
  },
  backdropLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  bgGlowPrimary: {
    position: "absolute",
    top: -120,
    left: "5%",
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: C.primary,
    opacity: 0.045,
  },
  bgGlowPrimaryOuter: {
    position: "absolute",
    top: -180,
    left: "-10%",
    width: 520,
    height: 520,
    borderRadius: 260,
    backgroundColor: C.primary,
    opacity: 0.025,
  },
  bgGlowWarm: {
    position: "absolute",
    bottom: -80,
    right: -120,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: C.accent,
    opacity: 0.035,
  },
  bgGlowWarmOuter: {
    position: "absolute",
    bottom: -140,
    right: -180,
    width: 460,
    height: 460,
    borderRadius: 230,
    backgroundColor: C.accent,
    opacity: 0.02,
  },
  headerBlock: {
    marginBottom: 14,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  backCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: "#FFFFFF0A",
    alignItems: "center",
    justifyContent: "center",
  },
  backGlyph: {
    color: C.text,
    fontSize: 24,
    lineHeight: 28,
    marginTop: -2,
  },
  title: {
    color: C.text,
    fontSize: 24,
    fontWeight: "600",
  },
  subtitle: {
    color: C.tertiary,
    fontSize: 12,
    marginTop: 4,
    marginBottom: 10,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  scrollContentTight: {
    paddingBottom: 8,
  },
  flexScroll: {
    flex: 1,
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    padding: 18,
    marginBottom: 14,
  },
  cardShadow: {
    shadowColor: shadows.darkCard.shadowColor,
    shadowOffset: shadows.darkCard.shadowOffset,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 4,
  },
  cardMuted: {
    backgroundColor: C.surfaceMuted,
  },
  inferenceCard: {
    borderRadius: 20,
  },
  warningCard: {
    backgroundColor: "#FF8A7A16",
  },
  liveCard: {
    backgroundColor: "#6BC9A818",
    borderRadius: 16,
  },
  bubbleText: {
    color: C.muted,
    fontSize: 13,
    lineHeight: 22,
  },
  userBubbleText: {
    color: C.text,
  },
  cardTitle: {
    color: C.text,
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 6,
  },
  caption: {
    color: C.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
  },
  captionSmall: {
    color: C.tertiary,
    fontSize: 12,
    marginTop: 4,
  },
  accentLabel: {
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 6,
  },
  pillCompact: {
    height: 34,
    minWidth: 86,
    paddingHorizontal: 16,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: "#FFFFFF0A",
    alignItems: "center",
    justifyContent: "center",
  },
  pillMid: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: "#FFFFFF0A",
    alignItems: "center",
    justifyContent: "center",
  },
  pillSmall: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: "#FFFFFF0A",
    alignItems: "center",
    justifyContent: "center",
  },
  pillProfile: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: "#FFFFFF0A",
    alignItems: "center",
    justifyContent: "center",
  },
  pillAction: {
    height: 48,
    minWidth: 104,
    paddingHorizontal: 18,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: "#FFFFFF0A",
    alignItems: "center",
    justifyContent: "center",
  },
  pillAlignStart: {
    alignSelf: "flex-start",
  },
  pillAlignEnd: {
    alignSelf: "flex-end",
  },
  pillTextMuted: {
    color: C.tertiary,
  },
  pillRowSpread: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pillRowInline: {
    flexDirection: "row",
    marginTop: 30,
    gap: 10,
  },
  pillRowCenter: {
    flexDirection: "row",
    marginTop: 30,
    gap: 10,
    justifyContent: "center",
  },
  pillActive: {
    backgroundColor: C.primarySoft,
    borderColor: "#7B8CFF44",
  },
  pillAccentActive: {
    backgroundColor: "#FF8A7A22",
    borderColor: "#FF8A7A44",
  },
  pillText: {
    color: C.muted,
    fontSize: 13,
    fontWeight: "500",
  },
  pillTextActive: {
    color: C.primary,
  },
  pillTextAccentActive: {
    color: C.accent,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
    gap: 10,
  },
  pillRowSpaced: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 24,
    gap: 10,
  },
  cardPillEnd: {
    marginTop: 14,
  },
  hintTestRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    gap: 8,
  },
  hintTestLabel: {
    flex: 1,
    color: C.tertiary,
    fontSize: 12,
  },
  pillWrapEnd: {
    alignSelf: "flex-end",
  },
  worldItemCard: {
    minHeight: 138,
  },
  profileCandidateCard: {
    minHeight: 168,
  },
  bottomActionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 20,
    paddingBottom: 12,
    gap: 12,
  },
  primaryButton: {
    backgroundColor: C.primary,
    borderRadius: 24,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  primaryButtonFull: {
    width: "100%",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  input: {
    backgroundColor: C.surfaceMuted,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: C.text,
    fontSize: 12,
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  inputInline: {
    flex: 1,
    marginBottom: 0,
    height: 48,
  },
  chatInputDock: {
    marginTop: 0,
    marginBottom: 0,
    height: 48,
  },
  contextCard: {
    marginBottom: 8,
  },
  sendButton: {
    backgroundColor: C.primary,
    borderRadius: 24,
    width: 66,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "500",
  },
  enterButton: {
    backgroundColor: C.primary,
    borderRadius: 24,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    paddingHorizontal: 40,
    marginBottom: 8,
  },
  userWrap: {
    alignItems: "flex-end",
  },
  userCard: {
    maxWidth: "86%",
    backgroundColor: "#7B8CFF22",
  },
  hero: {
    color: C.text,
    fontSize: 28,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 8,
  },
  heroBody: {
    color: C.muted,
    fontSize: 14,
    textAlign: "center",
    marginBottom: 16,
  },
  heroAsset: {
    color: C.text,
    fontSize: 24,
    fontWeight: "600",
    marginBottom: 8,
  },
  orbWrap: {
    alignItems: "center",
    justifyContent: "center",
    height: 220,
    marginVertical: 16,
  },
  orbOuter: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: C.primary,
    opacity: 0.08,
  },
  orbMid: {
    position: "absolute",
    width: 156,
    height: 156,
    borderRadius: 78,
    backgroundColor: C.primary,
    opacity: 0.12,
  },
  orbCore: {
    position: "absolute",
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: "#7B8CFF",
  },
  waveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    position: "absolute",
  },
  waveBar: {
    width: 8,
    borderRadius: 4,
    backgroundColor: "#FFFFFF",
  },
  traitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  accentBar: {
    width: 4,
    height: 42,
    borderRadius: 2,
  },
  traitBody: {
    flex: 1,
  },
  footer: {
    color: C.tertiary,
    fontSize: 10,
    textAlign: "center",
    marginTop: 8,
  },
  footerDock: {
    paddingTop: 8,
    paddingBottom: 12,
  },
});
