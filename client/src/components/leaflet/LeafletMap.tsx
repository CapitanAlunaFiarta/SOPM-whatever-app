import { useEffect, useRef, useState } from 'react';
import { Linking, type StyleProp, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { colors } from '../theme';
import { buildMapPage, parseMapEvent, safeJson, type MapEvent, type MapState } from './page';

/**
 * Pagina se încarcă „de pe” domeniul site-ului, ca cererile de tile-uri către OpenStreetMap
 * să aibă un Referer valid (cerut de politica de utilizare OSM).
 */
const BASE_URL = 'https://whatever-app-unitbv.me/';

/** Hartă Leaflet într-un WebView (Android). Primește starea și trimite înapoi evenimentele hărții. */
export function LeafletMap({ state, onEvent, style }: {
  state: MapState;
  onEvent?: (event: Exclude<MapEvent, { type: 'ready' }>) => void;
  style?: StyleProp<ViewStyle>;
}) {
  // Tipurile pachetului au `WebView<P = undefined>`, iar `Props & undefined` devine `never`: dăm explicit P.
  const webView = useRef<WebView<object>>(null);
  const serialized = safeJson(state);
  // Pagina se construiește o singură dată; actualizările merg prin window.__apply.
  const [html] = useState(() => buildMapPage(state));
  const latest = useRef(serialized);
  const ready = useRef(false);

  useEffect(() => {
    latest.current = serialized;
    if (ready.current) webView.current?.injectJavaScript(`window.__apply(${serialized}); true;`);
  }, [serialized]);

  const onMessage = (event: WebViewMessageEvent) => {
    const message = parseMapEvent(event.nativeEvent.data);
    if (!message) return;
    if (message.type === 'ready') {
      ready.current = true;
      // Starea s-ar fi putut schimba cât timp pagina se încărca.
      webView.current?.injectJavaScript(`window.__apply(${latest.current}); true;`);
      return;
    }
    onEvent?.(message);
  };

  return (
    <WebView<object>
      ref={webView}
      style={[{ backgroundColor: colors.input }, style]}
      source={{ html, baseUrl: BASE_URL }}
      originWhitelist={['*']}
      onMessage={onMessage}
      // Linkurile (ex. atribuirea OpenStreetMap) se deschid în browser, nu în hartă.
      onShouldStartLoadWithRequest={({ url }) => {
        if (url === BASE_URL || url.startsWith('about:') || url.startsWith('data:')) return true;
        void Linking.openURL(url).catch(() => undefined);
        return false;
      }}
      applicationNameForUserAgent="WhateverApp"
      javaScriptEnabled
      domStorageEnabled={false}
      setSupportMultipleWindows={false}
      // Harta stă într-un ScrollView: mișcările pe hartă rămân ale hărții.
      nestedScrollEnabled
      scrollEnabled={false}
      overScrollMode="never"
    />
  );
}
