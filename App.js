import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const roles = {
  patient: {
    label: 'Patient',
    icon: '🌼',
    welcome: 'Good morning, Asha',
    subtitle: 'Let us take today one gentle step at a time.',
    cards: [
      ['Today’s memory game', 'Match familiar faces', 'Play now'],
      ['Medicine reminder', 'After breakfast · 9:00 AM', 'Mark taken'],
      ['A message from Riya', '“I will call you this evening.”', 'Listen'],
    ],
  },
  caregiver: {
    label: 'Caregiver',
    icon: '🤝',
    welcome: 'Caregiver home',
    subtitle: 'A quick view of your loved one’s day.',
    cards: [
      ['Today’s check-in', 'Asha completed 2 of 3 reminders', 'View details'],
      ['Memory activity', 'Family photo quiz · score 8/10', 'See progress'],
      ['Send encouragement', 'Share a voice or video message', 'Send message'],
    ],
  },
  observer: {
    label: 'Medical Observer',
    icon: '🩺',
    welcome: 'Observer dashboard',
    subtitle: 'Review trends and support plans.',
    cards: [
      ['Patients needing review', '3 reminders were missed this week', 'Open list'],
      ['Engagement trend', 'Memory-game activity is steady', 'View trend'],
      ['Care plan notes', '2 caregiver updates received today', 'Review notes'],
    ],
  },
};

function RoleButton({ roleKey, onSelect }) {
  const role = roles[roleKey];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Continue as ${role.label}`}
      onPress={() => onSelect(roleKey)}
      style={({ pressed }) => [styles.roleButton, pressed && styles.pressed]}
    >
      <Text style={styles.roleIcon}>{role.icon}</Text>
      <View style={styles.roleCopy}>
        <Text style={styles.roleTitle}>{role.label}</Text>
        <Text style={styles.roleDescription}>
          {roleKey === 'patient'
            ? 'Play, remember, and stay connected'
            : roleKey === 'caregiver'
              ? 'Support and keep up with your loved one'
              : 'Monitor care and review progress'}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function Login({ onSelect }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.loginContainer}>
        <View style={styles.brandMark}><Text style={styles.brandFlower}>✦</Text></View>
        <Text style={styles.brand}>Smriti Saathi</Text>
        <Text style={styles.tagline}>A companion for memory, care, and connection.</Text>

        <View style={styles.loginPrompt}>
          <Text style={styles.question}>Who are you?</Text>
          <Text style={styles.helper}>Choose a profile to continue</Text>
        </View>

        <View style={styles.roleList}>
          <RoleButton roleKey="patient" onSelect={onSelect} />
          <RoleButton roleKey="caregiver" onSelect={onSelect} />
          <RoleButton roleKey="observer" onSelect={onSelect} />
        </View>
        <Text style={styles.footer}>Designed with care for every family.</Text>
      </View>
    </SafeAreaView>
  );
}

function LandingPage({ roleKey, onBack }) {
  const role = roles[roleKey];
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.pageContent}>
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" onPress={onBack} style={styles.backButton}>
            <Text style={styles.backText}>‹  Change role</Text>
          </Pressable>
          <Text style={styles.topIcon}>{role.icon}</Text>
        </View>

        <Text style={styles.pageEyebrow}>{role.label.toUpperCase()}</Text>
        <Text style={styles.pageTitle}>{role.welcome}</Text>
        <Text style={styles.pageSubtitle}>{role.subtitle}</Text>

        <View style={styles.statusBanner}>
          <Text style={styles.statusDot}>●</Text>
          <Text style={styles.statusText}>Everything is up to date</Text>
        </View>

        <Text style={styles.sectionTitle}>Your day at a glance</Text>
        {role.cards.map(([title, description, action]) => (
          <View style={styles.card} key={title}>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{title}</Text>
              <Text style={styles.cardDescription}>{description}</Text>
            </View>
            <Pressable accessibilityRole="button" style={styles.actionButton}>
              <Text style={styles.actionText}>{action}</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function App() {
  const [role, setRole] = useState(null);
  return role ? <LandingPage roleKey={role} onBack={() => setRole(null)} /> : <Login onSelect={setRole} />;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F6F8F1' },
  loginContainer: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  brandMark: { alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: 32, backgroundColor: '#DCE9D4', alignSelf: 'center' },
  brandFlower: { color: '#356047', fontSize: 34 },
  brand: { color: '#23412F', fontSize: 30, fontWeight: '700', textAlign: 'center', marginTop: 16 },
  tagline: { color: '#5E7162', fontSize: 16, textAlign: 'center', lineHeight: 23, marginTop: 8 },
  loginPrompt: { marginTop: 44, marginBottom: 18 },
  question: { color: '#1E3024', fontSize: 24, fontWeight: '700' },
  helper: { color: '#657367', fontSize: 15, marginTop: 5 },
  roleList: { gap: 12 },
  roleButton: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#E0E7DF', borderRadius: 18, borderWidth: 1, flexDirection: 'row', minHeight: 94, padding: 16, shadowColor: '#25432F', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.99 }] },
  roleIcon: { fontSize: 30, marginRight: 14 },
  roleCopy: { flex: 1 },
  roleTitle: { color: '#243B2B', fontSize: 18, fontWeight: '700' },
  roleDescription: { color: '#68756C', fontSize: 13, lineHeight: 19, marginTop: 4 },
  chevron: { color: '#52745C', fontSize: 32, fontWeight: '300' },
  footer: { color: '#78857B', fontSize: 12, textAlign: 'center', marginTop: 30 },
  pageContent: { padding: 24, paddingBottom: 42 },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 34 },
  backButton: { paddingVertical: 8 },
  backText: { color: '#426B50', fontSize: 15, fontWeight: '600' },
  topIcon: { fontSize: 32 },
  pageEyebrow: { color: '#638E70', fontSize: 12, fontWeight: '800', letterSpacing: 1.3 },
  pageTitle: { color: '#203B2A', fontSize: 29, fontWeight: '700', marginTop: 8 },
  pageSubtitle: { color: '#647367', fontSize: 16, lineHeight: 23, marginTop: 8 },
  statusBanner: { alignItems: 'center', backgroundColor: '#E2F0DF', borderRadius: 12, flexDirection: 'row', marginTop: 25, padding: 14 },
  statusDot: { color: '#3D8152', fontSize: 14, marginRight: 9 },
  statusText: { color: '#315D3D', fontSize: 14, fontWeight: '600' },
  sectionTitle: { color: '#263C2C', fontSize: 20, fontWeight: '700', marginBottom: 12, marginTop: 32 },
  card: { backgroundColor: '#FFFFFF', borderColor: '#E1E8E0', borderRadius: 16, borderWidth: 1, marginBottom: 12, padding: 17 },
  cardText: { marginBottom: 15 },
  cardTitle: { color: '#253A2B', fontSize: 16, fontWeight: '700' },
  cardDescription: { color: '#6B786E', fontSize: 14, lineHeight: 20, marginTop: 5 },
  actionButton: { alignSelf: 'flex-start', backgroundColor: '#356047', borderRadius: 9, paddingHorizontal: 14, paddingVertical: 9 },
  actionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
