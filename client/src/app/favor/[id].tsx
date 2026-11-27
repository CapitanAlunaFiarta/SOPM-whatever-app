import { CameraView, useCameraPermissions } from 'expo-camera';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { colors, radius } from '@/components/theme';
import { AppText, Banner, Button, Card, EmptyState, IconButton, Loading, Row, Screen } from '@/components/ui';
import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { showMessage } from '@/lib/dialogs';
import { currentPosition, type Position } from '@/lib/location';
import { useFavors, useSubmitFavorPhoto } from '@/lib/queries';

/** Lățimea maximă a pozei trimise: destul ca să se vadă clar, mică pentru telefon și server (~200 KB). */
const MAX_WIDTH = 1280;

type Shot = { uri: string; base64: string; takenAt: string; position: Position };

/**
 * Confirmarea unui favor: doar cu camera din aplicație (fără galerie). Poza, ora și locația sunt luate
 * în același moment; serverul verifică raza, iar prietenul care a cerut favorul aprobă poza.
 */
export default function FavorPhotoScreen() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const favorId = Number(id);
  const favors = useFavors();
  const favor = favors.data?.favors.find((item) => item.id === favorId);
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [shot, setShot] = useState<Shot | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = useSubmitFavorPhoto();

  if (favors.isLoading || !permission) return <Loading />;
  if (!favor || favor.role !== 'DOER' || favor.status !== 'ACCEPTED') {
    return (
      <Screen>
        <Card><EmptyState icon="camera-outline" title={t('favor.emptyTitle')} text={t('task.notFoundText')} /></Card>
      </Screen>
    );
  }

  const capture = async () => {
    if (!camera.current || !ready) return;
    setCapturing(true);
    setError(null);
    try {
      const takenAt = new Date().toISOString();
      const [picture, position] = await Promise.all([
        camera.current.takePictureAsync({ quality: 0.85, shutterSound: false }),
        currentPosition(),
      ]);
      const context = ImageManipulator.manipulate(picture.uri);
      if (picture.width > MAX_WIDTH) context.resize({ width: MAX_WIDTH });
      const image = await context.renderAsync();
      const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
      if (!saved.base64) throw new Error(t('error.unexpected'));
      setShot({ uri: saved.uri, base64: saved.base64, takenAt, position });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCapturing(false);
    }
  };

  const send = async () => {
    if (!shot) return;
    setError(null);
    try {
      const { latitude, longitude, accuracy, mocked } = shot.position;
      await submit.mutateAsync({ id: favorId, photo: shot.base64, takenAt: shot.takenAt, latitude, longitude, accuracy, mocked });
      showMessage(t('favor.status.SUBMITTED'), t('camera.sent'));
      if (router.canGoBack()) router.back();
      else router.replace({ pathname: '/social', params: { section: 'favors' } });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: favor.title }} />
      <AppText variant="muted">{t('camera.hint', { radius: favor.radius })}</AppText>
      {error ? <Banner text={error} onClose={() => setError(null)} /> : null}

      {!permission.granted ? (
        <Card>
          <AppText variant="heading">{t('camera.permissionTitle')}</AppText>
          <AppText variant="muted">{t('camera.permissionText')}</AppText>
          {permission.canAskAgain
            ? <Button title={t('camera.allow')} icon="camera-outline" onPress={() => { requestPermission().catch(() => undefined); }} />
            : <Banner tone="info" text={t('camera.denied')} />}
        </Card>
      ) : shot ? (
        <>
          <Image source={{ uri: shot.uri }} style={styles.frame} resizeMode="cover" />
          <Row style={{ flexWrap: 'wrap' }}>
            <Button title={t('camera.send')} icon="send" loading={submit.isPending} onPress={send} />
            <Button variant="secondary" title={t('camera.retake')} icon="refresh" onPress={() => setShot(null)} />
          </Row>
        </>
      ) : (
        <>
          <View style={styles.frame}>
            <CameraView ref={camera} style={StyleSheet.absoluteFill} facing={facing} onCameraReady={() => setReady(true)} />
          </View>
          <Row style={{ justifyContent: 'center' }} gap={18}>
            <Button title={t('camera.capture')} icon="camera" loading={capturing} disabled={!ready} onPress={capture} />
            <IconButton icon="camera-reverse-outline" label={t('camera.flip')}
              onPress={() => setFacing((value) => (value === 'back' ? 'front' : 'back'))} />
          </Row>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%', aspectRatio: 3 / 4, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.elevated,
    borderWidth: 1, borderColor: colors.border,
  },
});
