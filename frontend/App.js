import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiRequest } from './api';
import { setNotificationHandler } from 'expo-notifications/build/NotificationsHandler';
import { addNotificationReceivedListener, addNotificationResponseReceivedListener, clearLastNotificationResponseAsync, getLastNotificationResponseAsync } from 'expo-notifications/build/NotificationsEmitter';
import { SchedulableTriggerInputTypes } from 'expo-notifications/build/Notifications.types';
import { getPermissionsAsync, requestPermissionsAsync } from 'expo-notifications/build/NotificationPermissions';
import { setNotificationCategoryAsync } from 'expo-notifications/build/setNotificationCategoryAsync';
import { scheduleNotificationAsync } from 'expo-notifications/build/scheduleNotificationAsync';
import { cancelScheduledNotificationAsync } from 'expo-notifications/build/cancelScheduledNotificationAsync';

const REMINDERS_KEY = 'smriti-saathi.reminders.v1';
const RESPONSES_KEY = 'smriti-saathi.reminder-responses.v1';
const SESSION_KEY = 'smriti-saathi.session.v1';
const REMINDER_CATEGORY = 'reminder-response';
const handledNotificationResponses = new Set();

async function readSession() {
  let stored;
  if (Platform.OS === 'web') stored = await AsyncStorage.getItem(SESSION_KEY);
  else stored = await (await import('expo-secure-store')).getItemAsync(SESSION_KEY);
  return stored ? JSON.parse(stored) : null;
}

async function writeSession(session) {
  const stored = JSON.stringify(session);
  if (Platform.OS === 'web') await AsyncStorage.setItem(SESSION_KEY, stored);
  else await (await import('expo-secure-store')).setItemAsync(SESSION_KEY, stored);
}

async function clearSession() {
  if (Platform.OS === 'web') await AsyncStorage.removeItem(SESSION_KEY);
  else await (await import('expo-secure-store')).deleteItemAsync(SESSION_KEY);
}

if (Platform.OS !== 'web') {
  setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

const GROQ_API_KEY = process.env.EXPO_PUBLIC_QUIZ_API;
const GROQ_MODEL = process.env.EXPO_PUBLIC_GROQ_MODEL || 'openai/gpt-oss-120b';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const QUIZ_PROMPT = `Create a patient-facing memory quiz from the caregiver-provided context. Generate as many distinct, answerable questions as the facts support, from 1 to 5. Do not force extra questions, repeat a fact, or invent information. For each question provide exactly 4 options: one correct and 3 plausible incorrect options from the same category. Make questions varied and clear for a patient with memory difficulties. Vary correct option positions. Return only valid JSON, no markdown.

Point of view:
- The caregiver may describe the patient in third person. When a fact is about the patient, address the patient directly as "you/your". For example, if context says "The patient lives in Guwahati", ask "Where do you live?" Do not ask "Where does the patient live?"
- Unless the context clearly identifies someone else, treat an unnamed "she/he" and facts about the patient as referring to the patient. For example, "She has sisters Lata, Mina, and Sheela, and she is older than all of them" can produce "How many sisters do you have?", "What are your sisters' names?", and "Are you older than your sisters?" Preserve third-person names for other people.

Context:
{{sentence}}

Output format: {"questions":[{"question":"string","options":["string","string","string","string"],"correct_index":0}]}`;

function shuffleItems(items) {
 const a=[...items]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a;
}

const patternMotifs = [
  { id: 'gamosa-flower', symbol: '✿', name: 'Gamosa flower', color: '#B8443A' },
  { id: 'jaapi-sun', symbol: '✺', name: 'Jaapi sun', color: '#D08B32' },
  { id: 'bamboo-weave', symbol: '❖', name: 'Bamboo weave', color: '#55734E' },
  { id: 'river-wave', symbol: '≋', name: 'River wave', color: '#397A87' },
  { id: 'hill-sunrise', symbol: '⌃', name: 'Hill sunrise', color: '#8A597A' },
];

function createPattern(round) {
  const optionCount = round <= 2 ? 3 : 4;
  const sequenceLength = Math.min(3 + Math.floor((round - 1) / 2), 5);
  const cycle = shuffleItems(patternMotifs).slice(0, 2 + Math.floor(Math.random() * 2));
  const sequence = Array.from({ length: sequenceLength }, (_, index) => cycle[index % cycle.length]);
  const answer = cycle[sequenceLength % cycle.length];
  const distractors = shuffleItems(patternMotifs.filter((motif) => motif.id !== answer.id)).slice(0, optionCount - 1);
  return { sequence, answer, options: shuffleItems([answer, ...distractors]), sequenceLength, optionCount };
}

const starterMemories = [];

const roles = {
  patient: { label: 'Patient', icon: '🌼', subtitle: 'Let us take today one gentle step at a time.' },
  caregiver: { label: 'Caregiver', icon: '🤝', subtitle: 'A quick view of your loved one’s day.' },
  observer: { label: 'Medical Observer', icon: '🩺', subtitle: 'Review trends and support plans.' },
};

function Back({ text, onPress }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={styles.back}><Text style={styles.backText}>‹  {text}</Text></Pressable>;
}

function RolePicker({ onSelect }) {
  const descriptions = { patient: 'Play, remember, and stay connected', caregiver: 'Support and keep up with your loved one', observer: 'Monitor care and review progress' };
  return <SafeAreaView style={styles.safe}><StatusBar style="dark" /><View style={styles.login}>
    <View style={styles.brandMark}><Text style={styles.star}>✦</Text></View>
    <Text style={styles.brand}>Smriti Saathi</Text><Text style={styles.tagline}>A companion for memory, care, and connection.</Text>
    <Text style={styles.question}>Who are you?</Text><Text style={styles.helper}>Choose a profile to continue</Text>
    <View style={styles.roleList}>{Object.keys(roles).map((key) => <Pressable key={key} accessibilityRole="button" onPress={() => onSelect(key)} style={({ pressed }) => [styles.roleButton, pressed && styles.pressed]}>
      <Text style={styles.roleIcon}>{roles[key].icon}</Text><View style={styles.roleCopy}><Text style={styles.roleTitle}>{roles[key].label}</Text><Text style={styles.roleDescription}>{descriptions[key]}</Text></View><Text style={styles.chevron}>›</Text>
    </Pressable>)}</View><Text style={styles.footer}>Designed with care for every family.</Text>
  </View></SafeAreaView>;
}

function Login({ roleKey, onBack, onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const role = roles[roleKey];
  const registering = mode === 'register';

  const submit = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setMessage('Enter your email and password.');
      return;
    }
    if (registering && !name.trim()) {
      setMessage('Enter your name to create an account.');
      return;
    }
    if (registering && password.length < 10) {
      setMessage('Use a password with at least 10 characters.');
      return;
    }

    setBusy(true);
    setMessage('');
    try {
      if (registering) {
        await apiRequest('/auth/register', {
          method: 'POST',
          body: { name: name.trim(), email: cleanEmail, password, role: roleKey },
        });
      }
      const tokenResponse = await apiRequest('/auth/token', {
        method: 'POST',
        form: { username: cleanEmail, password },
      });
      const user = await apiRequest('/auth/me', { token: tokenResponse.access_token });
      if (user.role !== roleKey) {
        throw new Error(`This account is registered as ${roles[user.role]?.label || user.role}. Choose that role to sign in.`);
      }
      await onAuthenticated({ token: tokenResponse.access_token, user });
    } catch (error) {
      setMessage(error.message || 'Could not sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return <SafeAreaView style={styles.safe}><StatusBar style="dark" /><View style={styles.login}>
    <Back text="Choose a different role" onPress={onBack} />
    <View style={styles.brandMark}><Text style={styles.star}>{role.icon}</Text></View>
    <Text style={styles.brand}>{registering ? `Create ${role.label.toLowerCase()} account` : `${role.label} sign in`}</Text>
    <Text style={styles.tagline}>Use this account on your own phone.</Text>
    <View style={styles.builder}>
      {registering && <>
        <Text style={styles.inputLabel}>Your name</Text>
        <TextInput accessibilityLabel="Your name" autoCapitalize="words" autoComplete="name" onChangeText={setName} placeholder="Enter your name" placeholderTextColor="#93A096" style={styles.input} value={name} />
      </>}
      <Text style={[styles.inputLabel, registering && { marginTop: 16 }]}>Email</Text>
      <TextInput accessibilityLabel="Email" autoCapitalize="none" autoComplete="email" keyboardType="email-address" onChangeText={(value) => { setEmail(value); setMessage(''); }} onSubmitEditing={submit} placeholder="you@example.com" placeholderTextColor="#93A096" returnKeyType="next" style={styles.input} value={email} />
      <Text style={[styles.inputLabel, { marginTop: 16 }]}>Password</Text>
      <TextInput accessibilityLabel="Password" autoCapitalize="none" autoComplete={registering ? 'new-password' : 'password'} onChangeText={(value) => { setPassword(value); setMessage(''); }} onSubmitEditing={submit} placeholder={registering ? 'At least 10 characters' : 'Enter your password'} placeholderTextColor="#93A096" returnKeyType="go" secureTextEntry style={styles.input} value={password} />
      {!!message && <Text accessibilityRole="alert" style={styles.message}>{message}</Text>}
      <Pressable accessibilityRole="button" disabled={busy} onPress={submit} style={[styles.primary, busy && styles.disabled]}>
        {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryText}>{registering ? 'Create account' : 'Sign in'}</Text>}
      </Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setMode(registering ? 'login' : 'register'); setMessage(''); }} style={styles.secondary}>
        <Text style={styles.secondaryText}>{registering ? 'Already have an account? Sign in' : 'New here? Create an account'}</Text>
      </Pressable>
    </View>
    <Text style={styles.footer}>Designed with care for every family.</Text>
  </View></SafeAreaView>;
}

function Landing({ roleKey, displayName, memoryCount, reminderCount, onSignOut, onBuilder, onQuiz, onPattern, onReminders, onCareTeam }) {
  const role = roles[roleKey];
  const cards = roleKey === 'caregiver'
    ? [['Create memory quiz', `${memoryCount} memories ready for the patient quiz`, 'Add memories', onBuilder]]
    : roleKey === 'patient'
      ? [['Today’s memory game', `${memoryCount} personal questions ready`, 'Play now', onQuiz], ['Pattern recognition', 'Follow a repeating motif sequence', 'Play patterns', onPattern]]
      : [];
  cards.push(['Reminders', reminderCount + ' scheduled reminders', 'Open reminders', onReminders]);
  cards.push(['Care team', 'Connect patient, caregiver, and observer accounts', 'Manage connections', onCareTeam]);
  return <SafeAreaView style={styles.safe}><StatusBar style="dark" /><ScrollView contentContainerStyle={styles.page}>
    <View style={styles.topbar}><Back text="Sign out" onPress={onSignOut}/><Text style={styles.topIcon}>{role.icon}</Text></View>
    <Text style={styles.eyebrow}>{role.label.toUpperCase()}</Text><Text style={styles.pageTitle}>{roleKey === 'patient' ? `Good morning, ${displayName}` : `Welcome, ${displayName}`}</Text><Text style={styles.subtitle}>{role.subtitle}</Text>
    <View style={styles.status}><Text style={styles.statusDot}>●</Text><Text style={styles.statusText}>Everything is up to date</Text></View>
    <Text style={styles.sectionTitle}>Your day at a glance</Text>{cards.map(([title, description, action, handler]) => <View style={styles.card} key={title}>
      <Text style={styles.cardTitle}>{title}</Text><Text style={styles.cardDescription}>{description}</Text><Pressable accessibilityRole="button" onPress={handler} style={styles.action}><Text style={styles.actionText}>{action}</Text></Pressable>
    </View>)}
  </ScrollView></SafeAreaView>;
}

function CareTeam({ user, token, onBack, onSignOut }) {
  const [links, setLinks] = useState([]);
  const [requests, setRequests] = useState([]);
  const [patientEmail, setPatientEmail] = useState('');
  const [scores, setScores] = useState(null);
  const [scoresTitle, setScoresTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const isPatient = user.role === 'patient';

  const refresh = async () => {
    setBusy(true);
    setMessage('');
    try {
      const [linkedPeople, pendingRequests] = await Promise.all([
        apiRequest('/relationships', { token }),
        isPatient ? apiRequest('/relationships/requests', { token }) : Promise.resolve([]),
      ]);
      setLinks(linkedPeople);
      setRequests(pendingRequests);
    } catch (error) {
      setMessage(error.message || 'Could not load care-team links.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { refresh(); }, [token, user.id, user.role]);

  const sendRequest = async () => {
    const email = patientEmail.trim().toLowerCase();
    if (!email) {
      setMessage('Enter the patient’s account email.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      await apiRequest('/relationships', { method: 'POST', token, body: { patient_email: email } });
      setPatientEmail('');
      await refresh();
      setMessage('Request sent. The patient needs to approve it.');
    } catch (error) {
      setMessage(error.message || 'Could not send the request.');
      setBusy(false);
    }
  };

  const answerRequest = async (linkId, action) => {
    setBusy(true);
    setMessage('');
    try {
      await apiRequest(`/relationships/${linkId}/${action}`, { method: 'POST', token });
      await refresh();
    } catch (error) {
      setMessage(error.message || 'Could not update the request.');
      setBusy(false);
    }
  };

  const openScores = async (patientId, title) => {
    setBusy(true);
    setMessage('');
    setScoresTitle(title);
    setScores(null);
    try {
      const records = await apiRequest(`/patients/${patientId}/scores`, { token });
      setScores(records);
    } catch (error) {
      setMessage(error.message || 'Could not load scores.');
      setScores(null);
    } finally {
      setBusy(false);
    }
  };

  return <SafeAreaView style={styles.safe}><StatusBar style="dark" /><ScrollView contentContainerStyle={styles.page}>
    <Back text="Back home" onPress={onBack} />
    <Text style={styles.eyebrow}>CONNECTED ACCOUNTS</Text>
    <Text style={styles.pageTitle}>Care team</Text>
    <Text style={styles.subtitle}>{isPatient ? 'Review who can see your progress.' : 'Connect with a patient to share progress securely.'}</Text>

    {!isPatient && <View style={styles.builder}>
      <Text style={styles.inputLabel}>Patient account email</Text>
      <TextInput accessibilityLabel="Patient account email" autoCapitalize="none" keyboardType="email-address" onChangeText={(value) => { setPatientEmail(value); setMessage(''); }} placeholder="patient@example.com" placeholderTextColor="#93A096" style={styles.input} value={patientEmail} />
      <Pressable accessibilityRole="button" disabled={busy} onPress={sendRequest} style={[styles.primary, busy && styles.disabled]}>
        {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryText}>Request connection</Text>}
      </Pressable>
    </View>}

    {isPatient && <>
      <Text style={styles.sectionTitle}>Requests waiting for you ({requests.length})</Text>
      {!requests.length && <Text style={styles.subtitle}>No pending requests.</Text>}
      {requests.map((request) => <View key={request.link_id} style={styles.memory}>
        <View style={styles.memoryCopy}>
          <Text style={styles.memoryPrompt}>{request.person.name}</Text>
          <Text style={styles.memoryAnswer}>{roles[request.person.role]?.label || request.person.role} · {request.person.email}</Text>
        </View>
        <View style={careTeamStyles.actions}>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => answerRequest(request.link_id, 'accept')} style={careTeamStyles.acceptButton}><Text style={careTeamStyles.acceptText}>Accept</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => answerRequest(request.link_id, 'reject')}><Text style={styles.remove}>Decline</Text></Pressable>
        </View>
      </View>)}
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => openScores(user.id, 'My activity scores')} style={styles.secondary}>
        <Text style={styles.secondaryText}>View my activity scores</Text>
      </Pressable>
    </>}

    <Text style={styles.sectionTitle}>{isPatient ? 'Connected care team' : 'Patient connections'} ({links.length})</Text>
    {!links.length && <Text style={styles.subtitle}>{isPatient ? 'Accepted connections will appear here.' : 'No patient connections yet.'}</Text>}
    {links.map((link) => {
      const person = link.person;
      const canReadScores = link.status === 'active';
      return <View key={link.link_id} style={styles.memory}>
        <View style={styles.memoryCopy}>
          <Text style={styles.memoryPrompt}>{person.name}</Text>
          <Text style={styles.memoryAnswer}>{roles[person.role]?.label || person.role} · {link.status}</Text>
        </View>
        {!isPatient && canReadScores && <Pressable accessibilityRole="button" disabled={busy} onPress={() => openScores(person.id, `${person.name}’s scores`)}><Text style={styles.backText}>Scores</Text></Pressable>}
      </View>;
    })}

    {scores && <>
      <Text style={styles.sectionTitle}>{scoresTitle} ({scores.length})</Text>
      {!scores.length && <Text style={styles.subtitle}>No game scores have been recorded yet.</Text>}
      {scores.map((entry) => <View key={entry.id} style={styles.memory}>
        <View style={styles.memoryCopy}>
          <Text style={styles.memoryPrompt}>{entry.activity.replace(/-/g, ' ')}</Text>
          <Text style={styles.memoryAnswer}>{new Date(entry.recorded_at).toLocaleString()}</Text>
        </View>
        <Text style={careTeamStyles.scoreValue}>{entry.value}</Text>
      </View>)}
    </>}
    {!!message && <Text accessibilityRole="alert" style={styles.message}>{message}</Text>}
    <Pressable accessibilityRole="button" disabled={busy} onPress={refresh} style={styles.secondary}>
      <Text style={styles.secondaryText}>{busy ? 'Loading…' : 'Refresh connections'}</Text>
    </Pressable>
    <Pressable accessibilityRole="button" onPress={onSignOut} style={styles.back}><Text style={styles.backText}>Sign out</Text></Pressable>
  </ScrollView></SafeAreaView>;
}


function ReminderCenter({ roleKey, reminders, responses, onAdd, onDelete, onBack }) {
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');
  const [frequency, setFrequency] = useState('daily');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const saveReminder = async () => {
    const name = title.trim();
    const match = time.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (!name) return setMessage('Enter what the patient should be reminded about.');
    if (!match) return setMessage('Enter a time in 24-hour format, for example 09:30.');
    if (Platform.OS === 'web') return setMessage('Scheduled mobile notifications are available in Expo Go on a phone.');
    setSaving(true); setMessage('');
    try {
      let permission = await getPermissionsAsync();
      if (permission.status !== 'granted') permission = await requestPermissionsAsync();
      if (permission.status !== 'granted') throw new Error('Allow notifications in your phone settings to schedule reminders.');
      const id = String(Date.now());
      const [hour, minute] = match.slice(1).map(Number);
      const item = { id, title: name, time: time.trim().padStart(5, '0'), frequency, createdBy: roles[roleKey].label, createdAt: new Date().toISOString() };
      let trigger;
      if (frequency === 'daily') trigger = { type: SchedulableTriggerInputTypes.DAILY, hour, minute };
      else {
        const fireAt = new Date(); fireAt.setHours(hour, minute, 0, 0);
        if (fireAt.getTime() <= Date.now()) fireAt.setDate(fireAt.getDate() + 1);
        trigger = { type: SchedulableTriggerInputTypes.DATE, date: fireAt };
      }
      const notificationId = await scheduleNotificationAsync({ content: { title: 'Reminder: ' + name, body: 'Have you completed this reminder? Choose Yes or No.', data: { reminder: item }, categoryIdentifier: REMINDER_CATEGORY }, trigger });
      await onAdd({ ...item, notificationId });
      setTitle(''); setTime(''); setMessage('Reminder scheduled. Notifications will ask for a Yes or No response.');
    } catch (error) { setMessage(error.message || 'Could not schedule this reminder.'); }
    finally { setSaving(false); }
  };
  return <SafeAreaView style={styles.safe}><StatusBar style="dark" /><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
    <Back text="Back home" onPress={onBack} /><Text style={styles.eyebrow}>REMINDERS</Text><Text style={styles.pageTitle}>Care reminders</Text>
    <Text style={styles.subtitle}>Set reminders from any profile. This phone will show a notification at the scheduled time.</Text>
    <View style={styles.builder}>
      <Text style={styles.inputLabel}>What should the patient remember?</Text>
      <TextInput value={title} onChangeText={setTitle} placeholder="e.g. Take morning medicine" placeholderTextColor="#93A096" style={styles.input} />
      <Text style={[styles.inputLabel, { marginTop: 16 }]}>Time (24-hour clock)</Text>
      <TextInput value={time} onChangeText={setTime} placeholder="09:30" placeholderTextColor="#93A096" keyboardType="numbers-and-punctuation" style={styles.input} />
      <Text style={[styles.inputLabel, { marginTop: 16 }]}>Repeat</Text>
      <View style={styles.frequencyRow}>{['daily', 'once'].map((value) => <Pressable key={value} onPress={() => setFrequency(value)} style={[styles.frequencyButton, frequency === value && styles.frequencyButtonSelected]}><Text style={[styles.frequencyText, frequency === value && styles.frequencyTextSelected]}>{value === 'daily' ? 'Every day' : 'Once'}</Text></Pressable>)}</View>
      <Text style={styles.hint}>Created by {roles[roleKey].label}. A one-time reminder set earlier than now will run tomorrow.</Text>
      <Pressable accessibilityRole="button" disabled={saving} onPress={saveReminder} style={[styles.primary, saving && styles.disabled]}>{saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryText}>Save reminder</Text>}</Pressable>
      {!!message && <Text style={styles.message}>{message}</Text>}
    </View>
    <Text style={styles.sectionTitle}>Scheduled reminders ({reminders.length})</Text>
    {!reminders.length && <Text style={styles.subtitle}>No reminders yet.</Text>}
    {reminders.map((item) => <View style={styles.memory} key={item.id}><View style={styles.memoryCopy}><Text style={styles.memoryPrompt}>{item.title}</Text><Text style={styles.memoryAnswer}>{item.time} - {item.frequency === 'daily' ? 'Daily' : 'One time'} - Set by {item.createdBy}</Text></View><Pressable accessibilityRole="button" onPress={() => onDelete(item)}><Text style={styles.remove}>Remove</Text></Pressable></View>)}
    {(roleKey === 'caregiver' || roleKey === 'observer') && <>
      <Text style={styles.sectionTitle}>Patient responses ({responses.length})</Text>
      <View style={styles.responseHeader}><Text style={styles.responseHeaderText}>Reminder / time</Text><Text style={styles.responseHeaderText}>Completed?</Text></View>
      {!responses.length && <Text style={styles.subtitle}>Responses will appear here after a reminder.</Text>}
      {responses.map((entry) => <View style={styles.responseRow} key={entry.id}><View style={styles.responseCell}><Text style={styles.responseTitle}>{entry.title}</Text><Text style={styles.responseMeta}>{new Date(entry.respondedAt).toLocaleString()} - {entry.respondedBy}</Text></View><Text style={[styles.responseValue, entry.completed ? styles.responseYes : styles.responseNo]}>{entry.completed ? 'Yes' : 'No'}</Text></View>)}
    </>}
  </ScrollView></SafeAreaView>;
}

function ReminderPopup({ reminder, onRespond }) {
  return <Modal visible={!!reminder} transparent animationType="fade" onRequestClose={() => onRespond(false)}>
    <View style={styles.modalShade}><View style={styles.modalCard}><Text style={styles.eyebrow}>REMINDER</Text><Text style={styles.modalTitle}>{reminder?.title}</Text><Text style={styles.subtitle}>Have you completed this reminder?</Text>
      <Pressable style={styles.primary} onPress={() => onRespond(true)}><Text style={styles.primaryText}>Yes, completed</Text></Pressable>
      <Pressable style={styles.secondary} onPress={() => onRespond(false)}><Text style={styles.secondaryText}>No, not yet</Text></Pressable>
    </View></View>
  </Modal>;
}

function Builder({ session, onAdd, onDelete, onBack, onCareTeam }) {
  const [sentence, setSentence] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [patients, setPatients] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [savedMemories, setSavedMemories] = useState([]);

  useEffect(() => {
    let active = true;
    apiRequest('/relationships', { token: session.token }).then((linkedPeople) => {
      if (!active) return;
      const linkedPatients = linkedPeople.filter((link) => link.status === 'active' && link.person.role === 'patient');
      setPatients(linkedPatients);
      if (linkedPatients.length === 1) setSelectedPatientId(linkedPatients[0].person.id);
      else if (!linkedPatients.some((link) => link.person.id === selectedPatientId)) setSelectedPatientId('');
    }).catch((error) => {
      if (active) setMessage(error.message || 'Could not load connected patients.');
    }).finally(() => {
      if (active) setLoadingPatients(false);
    });
    return () => { active = false; };
  }, [session.token]);

  useEffect(() => {
    let active = true;
    if (!selectedPatientId) {
      setSavedMemories([]);
      return () => { active = false; };
    }
    apiRequest(`/patients/${selectedPatientId}/memories`, { token: session.token }).then((items) => {
      if (active) setSavedMemories(items);
    }).catch((error) => {
      if (active) setMessage(error.message || 'Could not load this patient’s quiz questions.');
    });
    return () => { active = false; };
  }, [selectedPatientId, session.token]);

  const save = async () => {
    const factualSentence = sentence.trim();
    if (!factualSentence) return setMessage('Enter context or a few related sentences first.');
    if (!selectedPatientId) return setMessage('Connect to an accepted patient account before creating their quiz.');
    if (!GROQ_API_KEY) return setMessage('Groq key is unavailable. For Expo Go, configure EXPO_PUBLIC_QUIZ_API in your local app environment and fully reload.');
    setLoading(true); setMessage('');
    try {
      const prompt = QUIZ_PROMPT.replace('{{sentence}}', factualSentence);
      const response = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.5,
          top_p: 1,
          max_tokens: 1400,
          stream: false,
        }),
      });
      if (!response.ok) {
        const errorBody = await response.text();
        let providerMessage = '';
        try {
          const errorJson = JSON.parse(errorBody);
          providerMessage = errorJson?.error?.message || errorJson?.message || '';
        } catch {
          providerMessage = errorBody.slice(0, 240);
        }
        if (response.status === 401) throw new Error(`Groq rejected the API key (401). Check that EXPO_PUBLIC_QUIZ_API contains your Groq key.${providerMessage ? ` ${providerMessage}` : ''}`);
        throw new Error(`Groq request failed (${response.status}).${providerMessage ? ` ${providerMessage}` : ''}`);
      }
      const completion = await response.json();
      const generatedText = completion?.choices?.[0]?.message?.content;
      if (typeof generatedText !== 'string') throw new Error('Groq returned no quiz text.');
      const jsonText = generatedText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      let quiz;
      try { quiz = JSON.parse(jsonText); } catch { throw new Error('Groq did not return valid quiz JSON. Please try again.'); }
      if (!Array.isArray(quiz.questions) || quiz.questions.length < 1 || quiz.questions.length > 5) throw new Error('The API response must include between one and five questions.');
      const batchId = String(Date.now());
      const questionMemories = quiz.questions.map((item, index) => {
        if (typeof item.question !== 'string' || !item.question.trim() || !Array.isArray(item.options) || item.options.length !== 4 || item.options.some((option) => typeof option !== 'string' || !option.trim()) || new Set(item.options).size !== 4 || !Number.isInteger(item.correct_index) || item.correct_index < 0 || item.correct_index > 3) throw new Error('Question ' + (index + 1) + ' has invalid options or answer.');
        return { id: batchId + '-' + index, batchId, prompt: item.question, options: item.options, answer: item.options[item.correct_index] };
      });
      const savedQuestions = await Promise.all(questionMemories.map((question) => apiRequest(
        `/patients/${selectedPatientId}/memories`,
        { method: 'POST', token: session.token, body: { prompt: question.prompt, options: question.options, answer: question.answer } },
      )));
      onAdd(savedQuestions);
      setSavedMemories((current) => [...savedQuestions, ...current]);
      setSentence('');
      const patientName = patients.find((link) => link.person.id === selectedPatientId)?.person.name || 'the patient';
      setMessage(`${savedQuestions.length} question${savedQuestions.length === 1 ? '' : 's'} saved for ${patientName}.`);
    } catch (error) {
      setMessage(error.message === 'Network request failed'
        ? 'Could not reach Groq. Check your internet connection and try again.'
        : error.message || 'Could not create the quiz. Check the connection and try again.');
    } finally { setLoading(false); }
  };

  const removeQuestion = async (memory) => {
    setLoading(true);
    setMessage('');
    try {
      await apiRequest(`/patients/${selectedPatientId}/memories/${memory.id}`, { method: 'DELETE', token: session.token });
      setSavedMemories((current) => current.filter((item) => item.id !== memory.id));
      onDelete(memory.id);
    } catch (error) {
      setMessage(error.message || 'Could not remove this quiz question.');
    } finally { setLoading(false); }
  };

  return <SafeAreaView style={styles.safe}><StatusBar style="dark" /><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
    <Back text="Caregiver home" onPress={onBack}/><Text style={styles.eyebrow}>MEMORY QUIZ BUILDER</Text><Text style={styles.pageTitle}>Add quiz context</Text>
    <Text style={styles.subtitle}>Enter a short passage or several related facts. AI will create as many distinct questions as the facts support.</Text>
    <View style={styles.builder}>
      <Text style={styles.inputLabel}>Save questions for</Text>
      {patients.map((link) => <Pressable key={link.person.id} accessibilityRole="button" onPress={() => { setSelectedPatientId(link.person.id); setMessage(''); }} style={[styles.frequencyButton, selectedPatientId === link.person.id && styles.frequencyButtonSelected]}>
        <Text style={[styles.frequencyText, selectedPatientId === link.person.id && styles.frequencyTextSelected]}>{link.person.name} · {link.person.email}</Text>
      </Pressable>)}
      {loadingPatients && <ActivityIndicator color="#356047" />}
      {!loadingPatients && !patients.length && <>
        <Text style={styles.hint}>No accepted patient connection yet.</Text>
        <Pressable accessibilityRole="button" onPress={onCareTeam} style={styles.secondary}><Text style={styles.secondaryText}>Open care team</Text></Pressable>
      </>}
    </View>
    <View style={styles.builder}><Text style={styles.inputLabel}>Context or passage</Text>
      <TextInput value={sentence} onChangeText={setSentence} placeholder="For example: Riya is the patient's daughter. She lives in Shillong and enjoys gardening." placeholderTextColor="#93A096" multiline style={[styles.input, styles.promptInput]}/>
      <Text style={styles.hint}>Add related facts; the quiz will only use details that support a clear question.</Text>
      <Pressable accessibilityRole="button" disabled={loading || loadingPatients || !selectedPatientId} onPress={save} style={[styles.primary, (loading || loadingPatients || !selectedPatientId) && styles.disabled]}>{loading ? <ActivityIndicator color="#FFF"/> : <Text style={styles.primaryText}>Generate patient quiz</Text>}</Pressable>{!!message && <Text accessibilityRole="alert" style={styles.message}>{message}</Text>}
    </View><Text style={styles.sectionTitle}>Quiz questions for selected patient ({savedMemories.length})</Text>
    {savedMemories.map((memory) => <View style={styles.memory} key={memory.id}><View style={styles.memoryCopy}><Text style={styles.memoryPrompt}>{memory.prompt}</Text><Text style={styles.memoryAnswer}>Saved to patient account</Text></View><Pressable accessibilityRole="button" disabled={loading} onPress={() => removeQuestion(memory)}><Text style={styles.remove}>Remove</Text></Pressable></View>)}
  </ScrollView></SafeAreaView>;
}

function makeOptions(memory, memories) {
  if (memory.options?.length === 4) return shuffleItems(memory.options);
  const answers = memories.filter((item) => item.id !== memory.id).map((item) => item.answer);
  return [memory.answer, ...answers, 'Not sure yet', 'Something else', 'I would like a hint'].filter((value, index, all) => all.indexOf(value) === index).slice(0, 4).sort(() => Math.random() - 0.5);
}

function Quiz({ memories, onBack, onFinish }) {
  const [questions, setQuestions] = useState(() => shuffleItems(memories).slice(0, 5));
  const [index, setIndex] = useState(0); const [selected, setSelected] = useState(null); const [score, setScore] = useState(0); const [done, setDone] = useState(false);
  const [scoreState, setScoreState] = useState('idle');
  const [scoreError, setScoreError] = useState('');
  const memory = questions[index];
  const options = useMemo(() => memory ? makeOptions(memory, questions) : [], [memory, questions]);
  const saveScore = async () => {
    setScoreState('saving');
    setScoreError('');
    try {
      await onFinish(score, questions.length);
      setScoreState('saved');
    } catch (error) {
      setScoreState('error');
      setScoreError(error.message || 'Could not save your score.');
    }
  };
  if (!questions.length) return <SafeAreaView style={styles.safe}><View style={styles.empty}><Text style={styles.pageTitle}>No quiz yet</Text><Text style={styles.subtitle}>A caregiver can add familiar memories to begin.</Text><Pressable onPress={onBack} style={styles.primary}><Text style={styles.primaryText}>Go back</Text></Pressable></View></SafeAreaView>;
  if (done) return <SafeAreaView style={styles.safe}><View style={styles.empty}><Text style={styles.bigIcon}>🌼</Text><Text style={styles.pageTitle}>Well done!</Text><Text style={styles.subtitle}>You completed {score} of {questions.length} memory questions.</Text>{scoreState === 'saving' && <Text style={styles.message}>Saving your score…</Text>}{scoreState === 'saved' && <Text style={styles.message}>Your score was saved for your care team.</Text>}{!!scoreError && <><Text style={styles.correction}>{scoreError}</Text><Pressable accessibilityRole="button" onPress={saveScore} style={styles.secondary}><Text style={styles.secondaryText}>Retry saving score</Text></Pressable></>}<Pressable onPress={() => { setQuestions(shuffleItems(memories).slice(0, 5)); setIndex(0); setScore(0); setSelected(null); setDone(false); setScoreState('idle'); setScoreError(''); }} style={styles.primary}><Text style={styles.primaryText}>Play again</Text></Pressable><Pressable onPress={onBack} style={styles.secondary}><Text style={styles.secondaryText}>Back to home</Text></Pressable></View></SafeAreaView>;
  const choose = (option) => { if (!selected) { setSelected(option); if (option === memory.answer) setScore((value) => value + 1); } };
  const next = () => {
    if (index === questions.length - 1) {
      setDone(true);
      saveScore();
    } else {
      setIndex((value) => value + 1);
      setSelected(null);
    }
  };
  return <SafeAreaView style={styles.safe}><StatusBar style="dark"/><View style={styles.quiz}><Back text="Patient home" onPress={onBack}/><Text style={styles.eyebrow}>MEMORY TIME · {index + 1} OF {questions.length}</Text>
    <Text style={styles.quizQuestion}>{memory.prompt}</Text><Text style={styles.subtitle}>Take your time. Choose the answer that feels right.</Text>
    <View style={styles.options}>{options.map((option) => { const correct = selected && option === memory.answer; const wrong = selected === option && option !== memory.answer; return <Pressable key={option} accessibilityRole="button" onPress={() => choose(option)} style={[styles.option, correct && styles.correct, wrong && styles.wrong]}><Text style={styles.optionText}>{option}</Text></Pressable>; })}</View>
    {!!selected && <><Text style={selected === memory.answer ? styles.good : styles.correction}>{selected === memory.answer ? 'That’s right. Lovely remembering!' : `The answer is: ${memory.answer}`}</Text><Pressable onPress={next} style={styles.primary}><Text style={styles.primaryText}>{index === questions.length - 1 ? 'Finish quiz' : 'Next question'}</Text></Pressable></>}
  </View></SafeAreaView>;
}

function PatternGame({ onBack, onFinish }) {
  const [round, setRound] = useState(1);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [selectedMotifId, setSelectedMotifId] = useState(null);
  const [finished, setFinished] = useState(false);
  const [scoreState, setScoreState] = useState('idle');
  const [scoreError, setScoreError] = useState('');
  const pattern = useMemo(() => createPattern(round), [round]);

  const saveScore = async () => {
    setScoreState('saving');
    setScoreError('');
    try {
      await onFinish(score, {
        rounds: 5,
        patternLengths: [3, 3, 4, 4, 5],
        optionCounts: [3, 3, 4, 4, 4],
      });
      setScoreState('saved');
    } catch (error) {
      setScoreState('error');
      setScoreError(error.message || 'Could not save your score.');
    }
  };

  const chooseMotif = (motif) => {
    if (feedback) return;
    const correct = motif.id === pattern.answer.id;
    setSelectedMotifId(motif.id);
    setFeedback(correct ? 'correct' : 'incorrect');
    if (correct) setScore((current) => current + 1);
  };

  const nextRound = () => {
    if (round === 5) {
      setFinished(true);
      saveScore();
      return;
    }
    setFeedback(null);
    setSelectedMotifId(null);
    setRound((current) => current + 1);
  };

  const restart = () => {
    setRound(1);
    setScore(0);
    setFeedback(null);
    setSelectedMotifId(null);
    setFinished(false);
    setScoreState('idle');
    setScoreError('');
  };

  if (finished) {
    return <SafeAreaView style={styles.safe}><View style={styles.empty}>
      <Text style={styles.bigIcon}>✿</Text>
      <Text style={styles.pageTitle}>Lovely patterning!</Text>
      <Text style={styles.subtitle}>You found the next motif in {score} of 5 patterns.</Text>
      {scoreState === 'saving' && <Text style={styles.message}>Saving your score…</Text>}
      {scoreState === 'saved' && <Text style={styles.message}>Your score was saved for your care team.</Text>}
      {!!scoreError && <><Text style={styles.correction}>{scoreError}</Text><Pressable accessibilityRole="button" onPress={saveScore} style={styles.secondary}><Text style={styles.secondaryText}>Retry saving score</Text></Pressable></>}
      <Pressable accessibilityRole="button" onPress={restart} style={styles.primary}><Text style={styles.primaryText}>Play again</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={onBack} style={styles.secondary}><Text style={styles.secondaryText}>Back to home</Text></Pressable>
    </View></SafeAreaView>;
  }

  return <SafeAreaView style={styles.safe}><StatusBar style="dark" /><ScrollView contentContainerStyle={patternStyles.page}>
    <Back text="Patient home" onPress={onBack} />
    <Text style={styles.eyebrow}>PATTERN RECOGNITION · ROUND {round} OF 5</Text>
    <Text style={styles.pageTitle}>Follow the weave</Text>
    <Text style={styles.subtitle}>Look at the Northeast-inspired motifs. Which one comes next?</Text>
    <View style={patternStyles.difficulty}>
      <Text style={patternStyles.difficultyText}>Pattern length: {pattern.sequenceLength}</Text>
      <Text style={patternStyles.difficultyText}>Choices: {pattern.optionCount}</Text>
    </View>
    <View accessibilityLabel="Motif sequence" style={patternStyles.sequence}>
      {pattern.sequence.map((motif, index) => <View key={`${motif.id}-${index}`} style={patternStyles.motifTile}>
        <Text style={[patternStyles.motifSymbol, { color: motif.color }]}>{motif.symbol}</Text>
      </View>)}
      <View style={[patternStyles.motifTile, patternStyles.missingTile]}><Text style={patternStyles.missingSymbol}>?</Text></View>
    </View>
    <Text style={patternStyles.sequenceCaption}>Choose the motif that continues the repeating pattern.</Text>
    <View style={patternStyles.options}>
      {pattern.options.map((motif) => {
        const isCorrectAnswer = !!feedback && motif.id === pattern.answer.id;
        const isWrongSelection = feedback === 'incorrect' && motif.id === selectedMotifId;
        return <Pressable
          key={motif.id}
          accessibilityRole="button"
          accessibilityLabel={`Choose ${motif.name}`}
          accessibilityState={{ disabled: !!feedback }}
          disabled={!!feedback}
          onPress={() => chooseMotif(motif)}
          style={({ pressed }) => [patternStyles.option, pressed && !feedback && patternStyles.optionPressed, isCorrectAnswer && patternStyles.optionCorrect, isWrongSelection && patternStyles.optionWrong]}
        >
          <Text style={[patternStyles.optionSymbol, { color: motif.color }]}>{motif.symbol}</Text>
          <Text style={patternStyles.optionName}>{motif.name}</Text>
        </Pressable>;
      })}
    </View>
    {!!feedback && <>
      <Text style={feedback === 'correct' ? styles.good : styles.correction}>
        {feedback === 'correct' ? 'That’s right. You spotted the repeating motif!' : `The next motif is ${pattern.answer.name}.`}
      </Text>
      <Pressable accessibilityRole="button" onPress={nextRound} style={styles.primary}>
        <Text style={styles.primaryText}>{round === 5 ? 'See my score' : 'Next pattern'}</Text>
      </Pressable>
    </>}
  </ScrollView></SafeAreaView>;
}

export default function App() {
  const [role, setRole] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [screen, setScreen] = useState('home');
  const [memories, setMemories] = useState(starterMemories);
  const [reminders, setReminders] = useState([]);
  const [responses, setResponses] = useState([]);
  const [pendingReminder, setPendingReminder] = useState(null);

  const recordResponse = (reminder, completed, respondedBy) => {
    if (!reminder) return;
    const entry = { id: String(Date.now()) + Math.random(), reminderId: reminder.id, title: reminder.title, completed, respondedBy, respondedAt: new Date().toISOString() };
    setResponses((current) => {
      const updated = [entry, ...current];
      AsyncStorage.setItem(RESPONSES_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
    setPendingReminder(null);
  };

  const handleNotificationResponse = (notificationResponse) => {
    const reminder = notificationResponse?.notification?.request?.content?.data?.reminder;
    if (!reminder) return;
    const responseKey = [notificationResponse.notification.request.identifier, notificationResponse.notification.date, notificationResponse.actionIdentifier].join(':');
    if (handledNotificationResponses.has(responseKey)) return;
    handledNotificationResponses.add(responseKey);
    if (notificationResponse.actionIdentifier === 'YES' || notificationResponse.actionIdentifier === 'NO') {
      recordResponse(reminder, notificationResponse.actionIdentifier === 'YES', 'Patient');
    } else {
      setPendingReminder(reminder);
    }
    clearLastNotificationResponseAsync().catch(() => {});
  };

  useEffect(() => {
    let active = true;
    const loadSavedData = async () => {
      try {
        const values = await AsyncStorage.multiGet([REMINDERS_KEY, RESPONSES_KEY]);
        if (!active) return;
        const savedReminders = values[0]?.[1];
        const savedResponses = values[1]?.[1];
        if (savedReminders) setReminders(JSON.parse(savedReminders));
        if (savedResponses) setResponses(JSON.parse(savedResponses));
      } catch {}
    };
    loadSavedData();

    const restoreSession = async () => {
      try {
        const saved = await readSession();
        if (!saved?.token || !saved?.user) return;
        let user = saved.user;
        try {
          user = await apiRequest('/auth/me', { token: saved.token });
          await writeSession({ token: saved.token, user });
        } catch (error) {
          if (error.status === 401) {
            await clearSession();
            return;
          }
        }
        if (active) {
          setSession({ token: saved.token, user });
          setRole(user.role);
          setDisplayName(user.name);
          setScreen('home');
        }
      } catch {}
      finally {
        if (active) setAuthReady(true);
      }
    };
    restoreSession();

    if (Platform.OS === 'web') return () => { active = false; };
    setNotificationCategoryAsync(REMINDER_CATEGORY, [
      { identifier: 'YES', buttonTitle: 'Yes', options: { opensAppToForeground: true } },
      { identifier: 'NO', buttonTitle: 'No', options: { opensAppToForeground: true } },
    ]).catch(() => {});
    const receivedListener = addNotificationReceivedListener((notification) => {
      const reminder = notification.request.content.data?.reminder;
      if (reminder) setPendingReminder(reminder);
    });
    const responseListener = addNotificationResponseReceivedListener(handleNotificationResponse);
    getLastNotificationResponseAsync().then((response) => {
      if (response) handleNotificationResponse(response);
    }).catch(() => {});
    return () => {
      active = false;
      receivedListener.remove();
      responseListener.remove();
    };
  }, []);

  const addReminder = async (item) => {
    const updated = [item, ...reminders];
    setReminders(updated);
    await AsyncStorage.setItem(REMINDERS_KEY, JSON.stringify(updated));
  };
  const deleteReminder = async (item) => {
    if (item.notificationId) await cancelScheduledNotificationAsync(item.notificationId).catch(() => {});
    const updated = reminders.filter((reminder) => reminder.id !== item.id);
    setReminders(updated);
    await AsyncStorage.setItem(REMINDERS_KEY, JSON.stringify(updated));
  };

  const authenticate = async (newSession) => {
    await writeSession(newSession);
    setSession(newSession);
    setRole(newSession.user.role);
    setDisplayName(newSession.user.name);
    setScreen('home');
  };

  const signOut = async () => {
    await clearSession().catch(() => {});
    setSession(null);
    setRole(null);
    setDisplayName('');
    setScreen('home');
  };

  const savePatientScore = async (activity, value, details) => {
    if (!session || session.user.role !== 'patient') throw new Error('Sign in to a patient account to save game scores.');
    return apiRequest(`/patients/${session.user.id}/scores`, {
      method: 'POST',
      token: session.token,
      body: { activity, value, details },
    });
  };

  useEffect(() => {
    let active = true;
    if (!session || session.user.role !== 'patient') {
      setMemories([]);
      return () => { active = false; };
    }
    setMemories([]);
    apiRequest(`/patients/${session.user.id}/memories`, { token: session.token })
      .then((items) => { if (active) setMemories(items); })
      .catch(() => {});
    return () => { active = false; };
  }, [session?.token, session?.user.id, session?.user.role]);

  let content;
  if (!authReady) content = <SafeAreaView style={styles.safe}><View style={styles.empty}><ActivityIndicator color="#356047" /><Text style={styles.subtitle}>Connecting to your account…</Text></View></SafeAreaView>;
  else if (!role) content = <RolePicker onSelect={(selectedRole) => { setRole(selectedRole); setScreen('login'); }} />;
  else if (screen === 'login') content = <Login roleKey={role} onBack={() => { setRole(null); setScreen('home'); }} onAuthenticated={authenticate} />;
  else if (screen === 'builder' && session) content = <Builder session={session} onAdd={(newMemories) => setMemories((all) => [...all, ...newMemories])} onDelete={(id) => setMemories((all) => all.filter((memory) => memory.id !== id))} onBack={() => setScreen('home')} onCareTeam={() => setScreen('care-team')} />;
  else if (screen === 'quiz') content = <Quiz memories={memories} onBack={() => setScreen('home')} onFinish={(score, total) => savePatientScore('family-memory-quiz', score, { totalQuestions: total })} />;
  else if (screen === 'pattern') content = <PatternGame onBack={() => setScreen('home')} onFinish={(score, details) => savePatientScore('pattern-recognition', score, details)} />;
  else if (screen === 'care-team' && session) content = <CareTeam user={session.user} token={session.token} onBack={() => setScreen('home')} onSignOut={signOut} />;
  else if (screen === 'reminders') content = <ReminderCenter roleKey={role} reminders={reminders} responses={responses} onAdd={addReminder} onDelete={deleteReminder} onBack={() => setScreen('home')} />;
  else content = <Landing roleKey={role} displayName={displayName} memoryCount={memories.length} reminderCount={reminders.length} onSignOut={signOut} onBuilder={() => setScreen('builder')} onQuiz={() => setScreen('quiz')} onPattern={() => setScreen('pattern')} onReminders={() => setScreen('reminders')} onCareTeam={() => setScreen('care-team')} />;

  return <>{content}<ReminderPopup reminder={pendingReminder} onRespond={(completed) => recordResponse(pendingReminder, completed, roles[role || 'patient'].label)} /></>;
}

const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:'#F6F8F1'}, login:{flex:1,paddingHorizontal:24,justifyContent:'center'}, brandMark:{alignItems:'center',justifyContent:'center',width:64,height:64,borderRadius:32,backgroundColor:'#DCE9D4',alignSelf:'center'},star:{color:'#356047',fontSize:34},brand:{color:'#23412F',fontSize:30,fontWeight:'700',textAlign:'center',marginTop:16},tagline:{color:'#5E7162',fontSize:16,textAlign:'center',lineHeight:23,marginTop:8},question:{color:'#1E3024',fontSize:24,fontWeight:'700',marginTop:44},helper:{color:'#657367',fontSize:15,marginTop:5,marginBottom:18},roleList:{gap:12},roleButton:{alignItems:'center',backgroundColor:'#FFF',borderColor:'#E0E7DF',borderRadius:18,borderWidth:1,flexDirection:'row',minHeight:94,padding:16},pressed:{opacity:.75,transform:[{scale:.99}]},roleIcon:{fontSize:30,marginRight:14},roleCopy:{flex:1},roleTitle:{color:'#243B2B',fontSize:18,fontWeight:'700'},roleDescription:{color:'#68756C',fontSize:13,lineHeight:19,marginTop:4},chevron:{color:'#52745C',fontSize:32},footer:{color:'#78857B',fontSize:12,textAlign:'center',marginTop:30},page:{padding:24,paddingBottom:42},topbar:{alignItems:'center',flexDirection:'row',justifyContent:'space-between',marginBottom:34},back:{paddingVertical:8,alignSelf:'flex-start'},backText:{color:'#426B50',fontSize:15,fontWeight:'600'},topIcon:{fontSize:32},eyebrow:{color:'#638E70',fontSize:12,fontWeight:'800',letterSpacing:1.3},pageTitle:{color:'#203B2A',fontSize:29,fontWeight:'700',marginTop:8},subtitle:{color:'#647367',fontSize:16,lineHeight:23,marginTop:8},status:{alignItems:'center',backgroundColor:'#E2F0DF',borderRadius:12,flexDirection:'row',marginTop:25,padding:14},statusDot:{color:'#3D8152',fontSize:14,marginRight:9},statusText:{color:'#315D3D',fontSize:14,fontWeight:'600'},sectionTitle:{color:'#263C2C',fontSize:20,fontWeight:'700',marginBottom:12,marginTop:32},card:{backgroundColor:'#FFF',borderColor:'#E1E8E0',borderRadius:16,borderWidth:1,marginBottom:12,padding:17},cardTitle:{color:'#253A2B',fontSize:16,fontWeight:'700'},cardDescription:{color:'#6B786E',fontSize:14,lineHeight:20,marginTop:5,marginBottom:15},action:{alignSelf:'flex-start',backgroundColor:'#356047',borderRadius:9,paddingHorizontal:14,paddingVertical:9},actionText:{color:'#FFF',fontSize:13,fontWeight:'700'},builder:{backgroundColor:'#FFF',borderColor:'#E1E8E0',borderRadius:16,borderWidth:1,marginTop:25,padding:18},inputLabel:{color:'#304C38',fontSize:14,fontWeight:'700',marginBottom:8},input:{backgroundColor:'#F8FAF7',borderColor:'#CEDACF',borderRadius:10,borderWidth:1,color:'#263C2C',fontSize:16,minHeight:50,paddingHorizontal:13,paddingVertical:12,textAlignVertical:'top'},promptInput:{minHeight:82},hint:{color:'#758176',fontSize:12,lineHeight:17,marginBottom:18,marginTop:6},primary:{alignItems:'center',backgroundColor:'#356047',borderRadius:10,marginTop:20,paddingHorizontal:16,paddingVertical:13},disabled:{opacity:.6},primaryText:{color:'#FFF',fontSize:15,fontWeight:'700'},message:{color:'#3C7048',fontSize:13,lineHeight:19,marginTop:12},memory:{alignItems:'center',backgroundColor:'#FFF',borderColor:'#E1E8E0',borderRadius:13,borderWidth:1,flexDirection:'row',marginBottom:10,padding:14},memoryCopy:{flex:1,paddingRight:10},memoryPrompt:{color:'#2B4231',fontSize:15,fontWeight:'700'},memoryAnswer:{color:'#6D7A70',fontSize:13,marginTop:4},remove:{color:'#A44343',fontSize:13,fontWeight:'700'},quiz:{flex:1,padding:24},quizQuestion:{color:'#203B2A',fontSize:29,fontWeight:'700',lineHeight:38,marginTop:19},options:{gap:11,marginTop:32},option:{backgroundColor:'#FFF',borderColor:'#D8E3D7',borderRadius:13,borderWidth:1,minHeight:58,justifyContent:'center',paddingHorizontal:17},optionText:{color:'#2B4231',fontSize:16,fontWeight:'600'},correct:{backgroundColor:'#DDF0DE',borderColor:'#4B8A5A'},wrong:{backgroundColor:'#F7E0DF',borderColor:'#B65B58'},good:{color:'#357243',fontSize:16,fontWeight:'700',marginTop:22,textAlign:'center'},correction:{color:'#87433F',fontSize:16,fontWeight:'700',lineHeight:23,marginTop:22,textAlign:'center'},empty:{flex:1,justifyContent:'center',padding:28},bigIcon:{fontSize:40,textAlign:'center'},secondary:{alignItems:'center',borderColor:'#7F9684',borderRadius:10,borderWidth:1,marginTop:12,paddingHorizontal:16,paddingVertical:13},secondaryText:{color:'#426B50',fontSize:15,fontWeight:'700'},frequencyRow:{flexDirection:'row',gap:10,marginTop:10},frequencyButton:{alignItems:'center',borderColor:'#CEDACF',borderRadius:10,borderWidth:1,flex:1,padding:12},frequencyButtonSelected:{backgroundColor:'#E2F0DF',borderColor:'#4B8A5A'},frequencyText:{color:'#426B50',fontSize:14,fontWeight:'600'},frequencyTextSelected:{color:'#315D3D'},responseHeader:{backgroundColor:'#E2F0DF',borderRadius:10,flexDirection:'row',justifyContent:'space-between',marginBottom:8,padding:12},responseHeaderText:{color:'#315D3D',fontSize:13,fontWeight:'700'},responseRow:{alignItems:'center',backgroundColor:'#FFF',borderColor:'#E1E8E0',borderRadius:12,borderWidth:1,flexDirection:'row',marginBottom:8,padding:12},responseCell:{flex:1,paddingRight:8},responseTitle:{color:'#2B4231',fontSize:14,fontWeight:'700'},responseMeta:{color:'#758176',fontSize:11,marginTop:4},responseValue:{fontSize:14,fontWeight:'800',minWidth:48,textAlign:'right'},responseYes:{color:'#357243'},responseNo:{color:'#A44343'},modalShade:{alignItems:'center',backgroundColor:'rgba(20,35,24,0.48)',flex:1,justifyContent:'center',padding:24},modalCard:{backgroundColor:'#FFF',borderRadius:20,padding:22,width:'100%'},modalTitle:{color:'#203B2A',fontSize:24,fontWeight:'700',marginTop:8}
});

const patternStyles = StyleSheet.create({
  page: { padding: 24, paddingBottom: 42 },
  difficulty: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#E9EFE2', borderRadius: 12, marginTop: 22, padding: 13 },
  difficultyText: { color: '#426047', fontSize: 13, fontWeight: '700' },
  sequence: { alignItems: 'center', backgroundColor: '#FFFDF8', borderColor: '#DCCDB4', borderRadius: 18, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 20, padding: 14 },
  motifTile: { alignItems: 'center', backgroundColor: '#F6F0E5', borderColor: '#E6DAC5', borderRadius: 12, borderWidth: 1, height: 50, justifyContent: 'center', width: 48 },
  motifSymbol: { fontSize: 29, fontWeight: '700', textAlign: 'center' },
  missingTile: { backgroundColor: '#F3E8D5', borderColor: '#B98D5B', borderStyle: 'dashed' },
  missingSymbol: { color: '#8D6C43', fontSize: 25, fontWeight: '700' },
  sequenceCaption: { color: '#68756C', fontSize: 14, lineHeight: 21, marginTop: 14, textAlign: 'center' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 20 },
  option: { alignItems: 'center', backgroundColor: '#FFF', borderColor: '#D8E3D7', borderRadius: 14, borderWidth: 1, flexBasis: '47%', flexGrow: 1, justifyContent: 'center', minHeight: 92, padding: 12 },
  optionPressed: { backgroundColor: '#F1F5ED', borderColor: '#6D8B70' },
  optionCorrect: { backgroundColor: '#DDF0DE', borderColor: '#4B8A5A' },
  optionWrong: { backgroundColor: '#F7E0DF', borderColor: '#B65B58' },
  optionSymbol: { fontSize: 30, fontWeight: '700' },
  optionName: { color: '#344B39', fontSize: 12, fontWeight: '700', marginTop: 4, textAlign: 'center' },
});

const careTeamStyles = StyleSheet.create({
  actions: { alignItems: 'flex-end', gap: 10 },
  acceptButton: { backgroundColor: '#356047', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  acceptText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  scoreValue: { color: '#315D3D', fontSize: 18, fontWeight: '800' },
});
