import React from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#070b14',
    card: '#0f172a',
    text: '#f8fafc',
    border: '#1e293b',
    primary: '#38bdf8'
  }
};

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer theme={theme}>
        <AppNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}
