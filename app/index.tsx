import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>RhythmMind</Text>
      <Text style={styles.subtitle}>Rhythm training for every mind</Text>
      <Pressable style={styles.button} onPress={() => router.push('/session')}>
        <Text style={styles.buttonText}>Start session</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#07091a',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 40,
    fontWeight: '800',
    color: '#eef2ff',
    letterSpacing: 1,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 17,
    color: '#6b84c4',
    marginBottom: 64,
  },
  button: {
    backgroundColor: '#4a8ef0',
    borderRadius: 18,
    paddingVertical: 20,
    paddingHorizontal: 56,
  },
  buttonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
});
