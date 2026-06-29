import { Stack, router } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';

import { useAppStore } from '../store/useAppStore';

function RedirectGuard() {
  const userName = useAppStore(s => s.userName);

  useEffect(() => {
    // After the store hydrates, send first-time users to onboarding.
    // userName is '' until set during onboarding or by setUserName.
    if (userName === '') {
      router.replace('/onboarding');
    }
  }, [userName]);

  return null;
}

export default function RootLayout() {
  return (
    <>
      <StatusBar style="auto" />
      <RedirectGuard />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade',
        }}
      />
    </>
  );
}
