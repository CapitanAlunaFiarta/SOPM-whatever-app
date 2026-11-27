import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { ProgressRing } from '@/components/ProgressRing';
import { AppText, Banner, Button, Card, ChipGroup, Loading, MultiChipGroup, Row, Screen, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { confirmAction, showMessage } from '@/lib/dialogs';
import {
  clearSession, currentSession, hasUsageAccess, launchableApps, openedApps, openUsageAccessSettings, saveApps, savedApps,
  saveSession,
} from '@/lib/focus';
import {
  FOCUS_DURATIONS, focusOutcome, formatRemaining, newSession, type FocusApp, type FocusSession,
} from '@/lib/focusRules';
import { useCompleteTask, useTasks } from '@/lib/queries';

type Phase =
  | { kind: 'loading' }
  | { kind: 'access' }
  | { kind: 'setup' }
  | { kind: 'other'; session: FocusSession }
  | { kind: 'running'; session: FocusSession }
  | { kind: 'failed'; session: FocusSession; app: string; afterMinutes: number }
  | { kind: 'gaveUp'; session: FocusSession }
  | { kind: 'succeeded'; session: FocusSession };

const DURATION_OPTIONS = FOCUS_DURATIONS.map(String);

/**
 * Sesiune de focus pentru o activitate (doar Android), ca în Forest: alegi aplicațiile care te distrag și
 * durata; dacă deschizi vreuna, sesiunea pică. Verificarea se face din istoricul de utilizare al telefonului
 * când revii în aplicație și la final, deci funcționează și dacă Whatever a fost închisă între timp.
 */
export default function FocusScreen() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const taskId = Number(id);
  const tasks = useTasks();
  const task = tasks.data?.find((item) => item.id === taskId);
  const complete = useCompleteTask();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [apps, setApps] = useState<FocusApp[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [minutes, setMinutes] = useState('25');
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const phaseRef = useRef<Phase>(phase);
  const checking = useRef(false);
  const autoConfirmed = useRef(false);

  const show = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  /** Verifică o sesiune pornită: pică dacă s-a deschis o aplicație urmărită, reușește la final. */
  const check = useCallback(async (session: FocusSession) => {
    if (checking.current) return;
    checking.current = true;
    try {
      const outcome = focusOutcome(session, await openedApps(session), Date.now());
      if (outcome.status === 'running') {
        show({ kind: 'running', session });
        return;
      }
      await clearSession();
      show(outcome.status === 'failed'
        ? { kind: 'failed', session, app: outcome.app, afterMinutes: outcome.afterMinutes }
        : { kind: 'succeeded', session });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      checking.current = false;
    }
  }, [show]);

  /** Starea de pornire: o sesiune deja începută, lipsa accesului sau alegerea aplicațiilor. */
  const resume = useCallback(async (session: FocusSession | null) => {
    if (session && session.taskId !== taskId) {
      show({ kind: 'other', session });
      return;
    }
    if (session) {
      await check(session);
      return;
    }
    if (!hasUsageAccess()) {
      show({ kind: 'access' });
      return;
    }
    const [list, saved] = await Promise.all([launchableApps(), savedApps()]);
    setApps(list);
    setSelected((current) => (current.length > 0 ? current : saved.filter((pkg) => list.some((app) => app.packageName === pkg))));
    show({ kind: 'setup' });
  }, [check, show, taskId]);

  const load = useCallback(() => currentSession().then(resume), [resume]);

  useEffect(() => {
    currentSession().then(resume).catch((e) => setError(errorMessage(e)));
  }, [resume]);

  // La întoarcerea în aplicație: reverificăm sesiunea sau accesul dat între timp din Setări.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const current = phaseRef.current;
      if (current.kind === 'running') check(current.session).catch(() => undefined);
      if (current.kind === 'access') load().catch((e) => setError(errorMessage(e)));
    });
    return () => subscription.remove();
  }, [check, load]);

  // Ceasul sesiunii; la final verificăm o ultimă dată istoricul.
  useEffect(() => {
    if (phase.kind !== 'running') return undefined;
    const session = phase.session;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= session.endsAt) check(session).catch(() => undefined);
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, check]);

  // Reușită: activitatea se confirmă singură dacă nu cere locație sau biometrie (acelea au nevoie de tine).
  useEffect(() => {
    if (phase.kind !== 'succeeded' || !task || autoConfirmed.current) return;
    if (task.confirmedByMe || task.requiresLocation || task.requiresBiometrics) return;
    autoConfirmed.current = true;
    complete.mutateAsync(task).catch((e) => showMessage(t('card.confirmFailed'), errorMessage(e)));
  }, [phase, task, complete, t]);

  const start = async () => {
    setError(null);
    if (selected.length === 0) {
      setError(t('focus.noApps'));
      return;
    }
    const chosen = apps.filter((app) => selected.includes(app.packageName));
    const session = newSession(taskId, task?.title ?? '', Number(minutes), chosen, Date.now());
    await saveApps(selected);
    await saveSession(session);
    setNow(session.startedAt);
    show({ kind: 'running', session });
  };

  const giveUp = async (session: FocusSession) => {
    if (!(await confirmAction(t('focus.giveUpTitle'), t('focus.giveUpText'), t('focus.giveUp')))) return;
    await clearSession();
    show({ kind: 'gaveUp', session });
  };

  const confirmTask = async () => {
    if (!task) return;
    try {
      await complete.mutateAsync(task);
      if (router.canGoBack()) router.back();
    } catch (e) {
      showMessage(t('card.confirmFailed'), errorMessage(e));
    }
  };

  const query = search.trim().toLowerCase();
  const visibleApps = apps.filter((app) => selected.includes(app.packageName) || !query || app.label.toLowerCase().includes(query));

  return (
    <Screen>
      {task ? <AppText variant="heading">{task.title}</AppText> : null}
      {error ? <Banner text={error} onClose={() => setError(null)} /> : null}

      {phase.kind === 'loading' && <Card style={{ height: 200 }}><Loading /></Card>}

      {phase.kind === 'access' && (
        <Card>
          <AppText variant="heading">{t('focus.accessTitle')}</AppText>
          <AppText variant="muted">{t('focus.accessText')}</AppText>
          <Row style={{ flexWrap: 'wrap' }}>
            <Button title={t('focus.openSettings')} icon="settings-outline" onPress={openUsageAccessSettings} />
            <Button variant="secondary" title={t('focus.checkAgain')} icon="refresh"
              onPress={() => { load().catch((e) => setError(errorMessage(e))); }} />
          </Row>
        </Card>
      )}

      {phase.kind === 'setup' && (
        <>
          <AppText variant="muted">{t('focus.intro')}</AppText>
          <Card>
            <AppText variant="heading">{t('focus.apps')}</AppText>
            <TextField value={search} onChangeText={setSearch} placeholder={t('focus.searchApps')} />
            <MultiChipGroup options={visibleApps.map((app) => app.packageName)} values={selected} onChange={setSelected}
              labels={Object.fromEntries(apps.map((app) => [app.packageName, app.label]))} />
          </Card>
          <Card>
            <AppText variant="heading">{t('focus.duration')}</AppText>
            <ChipGroup options={DURATION_OPTIONS} value={minutes} onChange={setMinutes}
              labels={Object.fromEntries(DURATION_OPTIONS.map((value) => [value, t('focus.minutes', { count: value })]))} />
          </Card>
          <Button title={t('focus.start')} icon="leaf-outline" onPress={() => { start().catch((e) => setError(errorMessage(e))); }} />
        </>
      )}

      {phase.kind === 'running' && (
        <Card style={{ alignItems: 'center' }}>
          <ProgressRing size={200} stroke={14}
            percent={Math.min(100, ((now - phase.session.startedAt) / (phase.session.endsAt - phase.session.startedAt)) * 100)}
            center={formatRemaining(phase.session.endsAt - now)}
            label={t('focus.progressLabel', { time: formatRemaining(phase.session.endsAt - now) })} />
          <AppText variant="heading" style={{ textAlign: 'center' }}>{t('focus.running')}</AppText>
          <AppText variant="muted" style={{ textAlign: 'center' }}>
            {t('focus.watching', { apps: phase.session.apps.map((app) => app.label).join(', ') })}
          </AppText>
          <AppText variant="small" style={{ textAlign: 'center' }}>{t('focus.leaveHint')}</AppText>
          <Button variant="ghost" title={t('focus.giveUp')} onPress={() => { giveUp(phase.session).catch(() => undefined); }} />
        </Card>
      )}

      {(phase.kind === 'failed' || phase.kind === 'gaveUp') && (
        <Card>
          <AppText variant="heading">{t('focus.failedTitle')}</AppText>
          <AppText variant="muted">
            {phase.kind === 'failed' ? t('focus.failedText', { app: phase.app, minutes: phase.afterMinutes }) : t('focus.gaveUp')}
          </AppText>
          <Button title={t('common.retry')} icon="refresh" onPress={() => { load().catch((e) => setError(errorMessage(e))); }} />
        </Card>
      )}

      {phase.kind === 'succeeded' && (
        <Card>
          <AppText variant="heading">{t('focus.successTitle')}</AppText>
          <AppText variant="muted">{t('focus.successText', { minutes: phase.session.minutes })}</AppText>
          {task && !task.confirmedByMe && (
            <Button title={t('card.confirm')} icon="checkmark-circle" loading={complete.isPending} onPress={confirmTask} />
          )}
        </Card>
      )}

      {phase.kind === 'other' && (
        <Card>
          <AppText variant="muted">{t('focus.otherSession', { title: phase.session.taskTitle })}</AppText>
          <Button title={t('focus.openOther')} icon="leaf-outline" onPress={() => router.replace(`/focus/${phase.session.taskId}`)} />
        </Card>
      )}
    </Screen>
  );
}
