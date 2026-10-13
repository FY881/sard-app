/**
 * «الذكاء الاصطناعي» settings: provider, the user's own free key (stored
 * encrypted on device), model, test button, context/quality and the daily
 * local quota guard.
 */
import { useCallback, useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TextInput as PaperTextInput } from 'react-native-paper';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTheme } from '@hooks/persisted';
import {
  Appbar,
  Button,
  ConfirmationDialog,
  List,
  SafeAreaView,
  SegmentedControl,
  SwitchItem,
} from '@components';
import {
  AI_FEATURES,
  aiClient,
  dayKey,
  GEMINI_SUGGESTED_MODELS,
  getApiKey,
  getQuota,
  looksLikeGeminiKey,
  maskKey,
  OPENROUTER_BASE_URL,
  setApiKey,
  useAISettings,
  type AIFeature,
  type AIProviderId,
  type QuotaLimits,
  type QuotaState,
} from '@services/ai';
import { showToast } from '@utils/showToast';
import { AI_STRINGS, aiErrorMessage } from '../strings';
import {
  Card,
  Muted,
  Notice,
  Pill,
  ProgressBar,
  SectionTitle,
  Stepper,
} from '../components/ui';

const S = AI_STRINGS.settings;
const AI_STUDIO_URL = 'https://aistudio.google.com/apikey';

const AiSettingsScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation();
  const { settings, update } = useAISettings();
  const provider = settings.provider;

  const [keyDraft, setKeyDraft] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [storedKey, setStoredKey] = useState(() => getApiKey(provider));
  const [modelDraft, setModelDraft] = useState(
    provider === 'gemini' ? settings.geminiModel : settings.openaiModel,
  );
  const [baseUrlDraft, setBaseUrlDraft] = useState(settings.openaiBaseUrl);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    { ok: true; text: string } | { ok: false; text: string } | undefined
  >();
  const [removeVisible, setRemoveVisible] = useState(false);
  const [limits, setLimitsState] = useState<QuotaLimits>(() =>
    getQuota().getLimits(),
  );
  const [quotaState, setQuotaState] = useState<QuotaState>(() =>
    getQuota().getState(),
  );

  const refreshQuota = useCallback(() => {
    setQuotaState(getQuota().getState());
    setLimitsState(getQuota().getLimits());
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshQuota();
      setStoredKey(getApiKey(provider));
    }, [provider, refreshQuota]),
  );

  const switchProvider = (p: AIProviderId) => {
    update({ provider: p });
    setStoredKey(getApiKey(p));
    setKeyDraft('');
    setTestResult(undefined);
    setModelDraft(p === 'gemini' ? settings.geminiModel : settings.openaiModel);
  };

  const saveKey = () => {
    const k = keyDraft.trim();
    if (!k) return;
    setApiKey(provider, k);
    setStoredKey(k);
    setKeyDraft('');
    showToast(S.apiKeySaved);
  };

  const saveModel = (m: string) => {
    const model = m.trim();
    if (!model) return;
    setModelDraft(model);
    update(provider === 'gemini' ? { geminiModel: model } : { openaiModel: model });
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(undefined);
    try {
      const r = await aiClient.testConnection({
        provider,
        apiKey: keyDraft.trim() || storedKey,
        model: modelDraft.trim() || undefined,
        baseUrl: provider === 'openai-compatible' ? baseUrlDraft : undefined,
      });
      setTestResult({ ok: true, text: S.testOk(r.latencyMs, r.model) });
      if (keyDraft.trim()) saveKey();
    } catch (e) {
      setTestResult({ ok: false, text: aiErrorMessage(e) });
    } finally {
      setTesting(false);
    }
  };

  const setLimit = (feature: AIFeature | 'total', v: number) => {
    const next: QuotaLimits =
      feature === 'total'
        ? { ...limits, dailyTotal: v }
        : { ...limits, perFeature: { ...limits.perFeature, [feature]: v } };
    getQuota().setLimits(next);
    setLimitsState(next);
  };

  const usedTotal = useMemo(
    () =>
      Object.entries(quotaState.today.counts).reduce(
        (a, [k, n]) => (k === 'test' ? a : a + (n ?? 0)),
        0,
      ),
    [quotaState],
  );

  const keyLooksOff =
    provider === 'gemini' && !!keyDraft.trim() && !looksLikeGeminiKey(keyDraft);

  const inputTheme = {
    colors: {
      primary: theme.primary,
      onSurfaceVariant: theme.onSurfaceVariant,
      background: theme.surface,
    },
  };

  return (
    <SafeAreaView excludeTop>
      <Appbar title={S.title} handleGoBack={navigation.goBack} theme={theme} />
      <ScrollView contentContainerStyle={styles.content}>
        <Muted theme={theme} style={styles.subtitle}>
          {S.subtitle}
        </Muted>
        <SwitchItem
          label={S.enabled}
          description={S.enabledDesc}
          value={settings.enabled}
          onPress={() => update({ enabled: !settings.enabled })}
          theme={theme}
        />

        <SectionTitle theme={theme}>{S.provider}</SectionTitle>
        <View style={styles.segment}>
          <SegmentedControl<AIProviderId>
            options={[
              { value: 'gemini', label: 'Gemini' },
              { value: 'openai-compatible', label: 'OpenRouter / OpenAI' },
            ]}
            value={provider}
            onChange={v => switchProvider(v)}
            theme={theme}
          />
        </View>
        <Muted theme={theme} style={styles.hint}>
          {provider === 'gemini' ? S.providerGemini : S.providerOpenAI}
        </Muted>

        <SectionTitle theme={theme}>{S.apiKey}</SectionTitle>
        <Card theme={theme}>
          <View style={styles.keyStatus}>
            <Text style={[styles.keyStatusText, { color: theme.onSurface }]}>
              {storedKey ? `${S.apiKeyStored}: ${maskKey(storedKey)}` : S.apiKeyMissing}
            </Text>
            {storedKey ? (
              <Button
                mode="text"
                compact
                title={S.removeKey}
                textColor={theme.error}
                onPress={() => setRemoveVisible(true)}
              />
            ) : null}
          </View>
          <PaperTextInput
            mode="outlined"
            value={keyDraft}
            onChangeText={setKeyDraft}
            placeholder={
              provider === 'gemini' ? S.apiKeyPlaceholderGemini : S.apiKeyPlaceholderOpenAI
            }
            secureTextEntry={!showKey}
            autoCapitalize="none"
            autoCorrect={false}
            textColor={theme.onSurface}
            outlineColor={theme.outline}
            activeOutlineColor={theme.primary}
            style={styles.input}
            theme={inputTheme}
            right={
              <PaperTextInput.Icon
                icon={showKey ? 'eye-off' : 'eye'}
                color={theme.onSurfaceVariant}
                onPress={() => setShowKey(v => !v)}
              />
            }
          />
          {keyLooksOff ? (
            <Text style={[styles.warn, { color: theme.error }]}>{S.apiKeyLooksWrong}</Text>
          ) : null}
          <View style={styles.row}>
            <Button
              mode="contained"
              title={AI_STRINGS.common.save}
              disabled={!keyDraft.trim()}
              onPress={saveKey}
            />
            <View style={styles.spacer} />
            <Button
              mode="outlined"
              title={testing ? S.testing : S.test}
              loading={testing}
              disabled={testing || (!keyDraft.trim() && !storedKey)}
              onPress={runTest}
            />
          </View>
          {testResult ? (
            <Text
              style={[
                styles.testResult,
                { color: testResult.ok ? theme.primary : theme.error },
              ]}
            >
              {testResult.text}
            </Text>
          ) : null}
        </Card>
        {provider === 'gemini' ? (
          <List.Item
            title={S.getFreeKey}
            description={S.getFreeKeyDesc}
            icon="key-plus"
            onPress={() => Linking.openURL(AI_STUDIO_URL)}
            theme={theme}
          />
        ) : null}

        <SectionTitle theme={theme}>{S.model}</SectionTitle>
        <Card theme={theme}>
          <Muted theme={theme}>{S.modelDesc}</Muted>
          {provider === 'gemini' ? (
            <View style={styles.pills}>
              {GEMINI_SUGGESTED_MODELS.map(m => (
                <Pill
                  key={m}
                  theme={theme}
                  label={m}
                  active={modelDraft === m}
                  onPress={() => saveModel(m)}
                />
              ))}
            </View>
          ) : null}
          <PaperTextInput
            mode="outlined"
            value={modelDraft}
            onChangeText={setModelDraft}
            onBlur={() => saveModel(modelDraft)}
            autoCapitalize="none"
            autoCorrect={false}
            textColor={theme.onSurface}
            outlineColor={theme.outline}
            activeOutlineColor={theme.primary}
            style={styles.input}
            theme={inputTheme}
          />
          {provider === 'openai-compatible' ? (
            <>
              <Muted theme={theme} style={styles.fieldLabel}>
                {S.baseUrl}
              </Muted>
              <PaperTextInput
                mode="outlined"
                value={baseUrlDraft}
                onChangeText={setBaseUrlDraft}
                onBlur={() =>
                  update({ openaiBaseUrl: baseUrlDraft.trim() || OPENROUTER_BASE_URL })
                }
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                textColor={theme.onSurface}
                outlineColor={theme.outline}
                activeOutlineColor={theme.primary}
                style={styles.input}
                theme={inputTheme}
              />
            </>
          ) : null}
        </Card>

        <Notice theme={theme} icon="shield-lock-outline" title={S.privacyTitle} body={S.privacy} />

        <SectionTitle theme={theme}>{S.contextSection}</SectionTitle>
        <Stepper
          theme={theme}
          label={S.contextBudget}
          description={S.contextBudgetDesc(settings.contextBudgetChars)}
          value={settings.contextBudgetChars}
          min={8000}
          max={200000}
          step={8000}
          onChange={v => update({ contextBudgetChars: v })}
          format={v => `${Math.round(v / 1000)}k`}
        />
        <Stepper
          theme={theme}
          label={S.recapChapters}
          description={S.recapChaptersDesc(settings.recapChapters)}
          value={settings.recapChapters}
          min={1}
          max={10}
          onChange={v => update({ recapChapters: v })}
        />
        <Stepper
          theme={theme}
          label={S.askChapters}
          value={settings.askMaxChapters}
          min={20}
          max={2000}
          step={20}
          onChange={v => update({ askMaxChapters: v })}
        />
        <View style={styles.segmentRow}>
          <Text style={[styles.segmentLabel, { color: theme.onSurface }]}>
            {S.summaryLength}
          </Text>
          <SegmentedControl<'short' | 'medium' | 'long'>
            options={[
              { value: 'short', label: S.summaryShort },
              { value: 'medium', label: S.summaryMedium },
              { value: 'long', label: S.summaryLong },
            ]}
            value={settings.summaryLength}
            onChange={v => update({ summaryLength: v })}
            theme={theme}
          />
        </View>
        <Stepper
          theme={theme}
          label={S.temperature}
          value={Math.round(settings.temperature * 10)}
          min={0}
          max={10}
          onChange={v => update({ temperature: v / 10 })}
          format={v => (v / 10).toFixed(1)}
        />
        <SwitchItem
          label={S.autoRecap}
          description={S.autoRecapDesc}
          value={settings.autoRecapBeforeChapter}
          onPress={() => update({ autoRecapBeforeChapter: !settings.autoRecapBeforeChapter })}
          theme={theme}
        />
        <SwitchItem
          label={S.autoRetry}
          value={settings.autoRetryOnRateLimit}
          onPress={() => update({ autoRetryOnRateLimit: !settings.autoRetryOnRateLimit })}
          theme={theme}
        />

        <SectionTitle theme={theme}>{S.quotaSection}</SectionTitle>
        <Muted theme={theme} style={styles.hint}>
          {S.quotaDesc}
        </Muted>
        <Card theme={theme}>
          <Text style={[styles.quotaTitle, { color: theme.onSurface }]}>
            {S.quotaTotal}: {S.quotaUsedToday(usedTotal, limits.dailyTotal)}
          </Text>
          <ProgressBar
            theme={theme}
            value={limits.dailyTotal > 0 ? usedTotal / limits.dailyTotal : 0}
            style={styles.bar}
          />
          {AI_FEATURES.map(f => {
            const used = quotaState.today.counts[f] ?? 0;
            const limit = limits.perFeature[f] ?? 0;
            return (
              <View key={f} style={styles.quotaRow}>
                <View style={styles.quotaHead}>
                  <Text style={[styles.quotaName, { color: theme.onSurface }]}>
                    {AI_STRINGS.features[f]}
                  </Text>
                  <Muted theme={theme}>{S.quotaUsedToday(used, limit)}</Muted>
                </View>
                <ProgressBar theme={theme} value={limit > 0 ? used / limit : 0} />
              </View>
            );
          })}
        </Card>
        <Stepper
          theme={theme}
          label={S.quotaTotal}
          value={limits.dailyTotal}
          min={0}
          max={2000}
          step={10}
          onChange={v => setLimit('total', v)}
          format={v => (v === 0 ? S.unlimited : String(v))}
        />
        {AI_FEATURES.map(f => (
          <Stepper
            key={f}
            theme={theme}
            label={AI_STRINGS.features[f]}
            value={limits.perFeature[f] ?? 0}
            min={0}
            max={1000}
            step={5}
            onChange={v => setLimit(f, v)}
            format={v => (v === 0 ? S.unlimited : String(v))}
          />
        ))}
        {quotaState.history.length ? (
          <Card theme={theme}>
            <Text style={[styles.quotaTitle, { color: theme.onSurface }]}>{S.quotaHistory}</Text>
            {quotaState.history.map(d => {
              const n = Object.entries(d.counts).reduce(
                (a, [k, v]) => (k === 'test' ? a : a + (v ?? 0)),
                0,
              );
              return (
                <View key={d.day} style={styles.historyRow}>
                  <Muted theme={theme}>{d.day}</Muted>
                  <Text style={{ color: theme.onSurface }}>{n}</Text>
                </View>
              );
            })}
          </Card>
        ) : null}
        <View style={styles.resetRow}>
          <Button
            mode="outlined"
            title={S.quotaReset}
            onPress={() => {
              getQuota().resetToday();
              refreshQuota();
              showToast(S.quotaResetDone);
            }}
          />
          <Muted theme={theme}>{dayKey(new Date())}</Muted>
        </View>
      </ScrollView>
      <ConfirmationDialog
        visible={removeVisible}
        title={S.removeKey}
        message={S.removeKeyConfirm}
        confirmLabel={S.removeKey}
        cancelLabel={AI_STRINGS.common.cancel}
        confirmTone="danger"
        onConfirm={() => {
          setApiKey(provider, '');
          setStoredKey('');
          setRemoveVisible(false);
          setTestResult(undefined);
          showToast(S.apiKeyRemoved);
        }}
        onDismiss={() => setRemoveVisible(false)}
      />
    </SafeAreaView>
  );
};

export default AiSettingsScreen;

const styles = StyleSheet.create({
  content: { paddingBottom: 48 },
  subtitle: { marginHorizontal: 16, marginBottom: 8 },
  segment: { marginHorizontal: 16, marginBottom: 4 },
  hint: { marginHorizontal: 16, marginBottom: 6 },
  keyStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  keyStatusText: { fontSize: 14, fontWeight: '500', flex: 1 },
  input: { marginTop: 10, fontSize: 14 },
  warn: { marginTop: 6, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  spacer: { width: 8 },
  testResult: { marginTop: 10, fontSize: 13, fontWeight: '500' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  fieldLabel: { marginTop: 12 },
  segmentRow: { paddingHorizontal: 16, paddingVertical: 10 },
  segmentLabel: { fontSize: 16, marginBottom: 8 },
  quotaTitle: { fontSize: 15, fontWeight: '600', marginBottom: 6 },
  bar: { marginBottom: 12 },
  quotaRow: { marginTop: 8 },
  quotaHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  quotaName: { fontSize: 14 },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  resetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 12,
  },
});
