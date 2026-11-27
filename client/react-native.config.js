// react-native-maps e folosit doar pe iOS (Apple Maps). Pe Android harta este Leaflet într-un
// WebView, deci modulul nativ (și SDK-ul Google Maps de care depinde) nu intră în APK.
module.exports = {
  dependencies: {
    'react-native-maps': {
      platforms: {
        android: null,
      },
    },
  },
};
