import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setNotificationHandler } from 'expo-notifications/build/NotificationsHandler';
import { addNotificationReceivedListener, addNotificationResponseReceivedListener, clearLastNotificationResponseAsync, getLastNotificationResponseAsync } from 'expo-notifications/build/NotificationsEmitter';
import { SchedulableTriggerInputTypes } from 'expo-notifications/build/Notifications.types';
import { getPermissionsAsync, requestPermissionsAsync } from 'expo-notifications/build/NotificationPermissions';
import { setNotificationCategoryAsync } from 'expo-notifications/build/setNotificationCategoryAsync';
import { scheduleNotificationAsync } from 'expo-notifications/build/scheduleNotificationAsync';
import { cancelScheduledNotificationAsync } from 'expo-notifications/build/cancelScheduledNotificationAsync';

const REMINDERS_KEY = 'smriti-saathi.reminders.v1';
const RESPONSES_KEY = 'smriti-saathi.reminder-responses.v1';
const REMINDER_CATEGORY = 'reminder-response';
const handledNotificationResponses = new Set();

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
- The caregiver may describe the patient in third person. When a fact is about the patient, address the patient directly as "you/your". For example, if context says "Asha lives in Guwahati", ask "Where do you live?" Do not ask "Where does Asha live?"
- Unless the context clearly identifies someone else, treat an unnamed "she/he" and facts about the patient as referring to the patient. For example, "She has sisters Lata, Mina, and Sheela, and she is older than all of them" can produce "How many sisters do you have?", "What are your sisters' names?", and "Are you older than your sisters?" Preserve third-person names for other people.

Context:
{{sentence}}

Output format: {"questions":[{"question":"string","options":["string","string","string","string"],"correct_index":0}]}`;

function shuffleItems(items) {
 const a=[...items]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a;
}

const starterMemories = [];

const roles = {
  patient: { label: 'Patient', icon: '🌼', welcome: 'Good morning, Asha', subtitle: 'Let us take today one gentle step at a time.' },
  caregiver: { label: 'Caregiver', icon: '🤝', welcome: 'Caregiver home', subtitle: 'A quick view of your loved one’s day.' },
  observer: { label: 'Medical Observer', icon: '🩺', welcome: 'Observer dashboard', subtitle: 'Review trends and support plans.' },
};

function Back({ text, onPress }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={styles.back}><Text style={styles.backText}>‹  {text}</Text></Pressable>;
}

function Login({ onSelect }) {
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

function Landing({ roleKey, memoryCount, reminderCount, responseCount, onChangeRole, onBuilder, onQuiz, onReminders }) {
  const role = roles[roleKey];
  const cards = roleKey === 'caregiver'
    ? [['Create memory quiz', `${memoryCount} memories ready for the patient quiz`, 'Add memories', onBuilder], ['Today’s check-in', 'Asha completed 2 of 3 reminders', 'View details'], ['Send encouragement', 'Share a voice or video message', 'Send message']]
    : roleKey === 'patient'
      ? [['Today’s memory game', `${memoryCount} personal questions ready`, 'Play now', onQuiz], ['Medicine reminder', 'After breakfast · 9:00 AM', 'Mark taken'], ['A message from Riya', '“I will call you this evening.”', 'Listen']]
      : [['Patients needing review', '3 reminders were missed this week', 'Open list'], ['Engagement trend', 'Memory-game activity is steady', 'View trend'], ['Care plan notes', '2 caregiver updates received today', 'Review notes']];
  cards.push(['Reminders', reminderCount + ' scheduled reminders', 'Open reminders', onReminders]);
  if (roleKey === 'caregiver' || roleKey === 'observer') cards.push(['Reminder responses', responseCount + ' responses recorded', 'View response table', onReminders]);
  return <SafeAreaView style={styles.safe}><StatusBar style="dark" /><ScrollView contentContainerStyle={styles.page}>
    <View style={styles.topbar}><Back text="Change role" onPress={onChangeRole}/><Text style={styles.topIcon}>{role.icon}</Text></View>
    <Text style={styles.eyebrow}>{role.label.toUpperCase()}</Text><Text style={styles.pageTitle}>{role.welcome}</Text><Text style={styles.subtitle}>{role.subtitle}</Text>
    <View style={styles.status}><Text style={styles.statusDot}>●</Text><Text style={styles.statusText}>Everything is up to date</Text></View>
    <Text style={styles.sectionTitle}>Your day at a glance</Text>{cards.map(([title, description, action, handler]) => <View style={styles.card} key={title}>
      <Text style={styles.cardTitle}>{title}</Text><Text style={styles.cardDescription}>{description}</Text><Pressable accessibilityRole="button" onPress={handler} style={styles.action}><Text style={styles.actionText}>{action}</Text></Pressable>
    </View>)}
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

function Builder({ memories, onAdd, onDelete, onBack }) {
  const [sentence, setSentence] = useState(''); const [message, setMessage] = useState(''); const [loading, setLoading] = useState(false);
  const save = async () => {
    const factualSentence = sentence.trim();
    if (!factualSentence) return setMessage('Enter context or a few related sentences first.');
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
      onAdd(questionMemories);
      setSentence(''); setMessage(questionMemories.length + ' question' + (questionMemories.length === 1 ? '' : 's') + ' created from those details.');
    } catch (error) {
      setMessage(error.message === 'Network request failed'
        ? 'Could not reach Groq. Check your internet connection and try again.'
        : error.message || 'Could not create the quiz. Check the connection and try again.');
    } finally { setLoading(false); }
  };
  return <SafeAreaView style={styles.safe}><StatusBar style="dark" /><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
    <Back text="Caregiver home" onPress={onBack}/><Text style={styles.eyebrow}>MEMORY QUIZ BUILDER</Text><Text style={styles.pageTitle}>Add quiz context</Text>
    <Text style={styles.subtitle}>Enter a short passage or several related facts. AI will create as many distinct questions as the facts support.</Text>
    <View style={styles.builder}><Text style={styles.inputLabel}>Context or passage</Text>
      <TextInput value={sentence} onChangeText={setSentence} placeholder="For example: Riya is Asha's daughter. She lives in Shillong and enjoys gardening." placeholderTextColor="#93A096" multiline style={[styles.input, styles.promptInput]}/>
      <Text style={styles.hint}>Add related facts; the quiz will only use details that support a clear question.</Text>
      <Pressable accessibilityRole="button" disabled={loading} onPress={save} style={[styles.primary, loading && styles.disabled]}>{loading ? <ActivityIndicator color="#FFF"/> : <Text style={styles.primaryText}>Generate patient quiz</Text>}</Pressable>{!!message && <Text style={styles.message}>{message}</Text>}
    </View><Text style={styles.sectionTitle}>Quiz questions ({memories.length})</Text>
    {memories.map((memory) => <View style={styles.memory} key={memory.id}><View style={styles.memoryCopy}><Text style={styles.memoryPrompt}>{memory.prompt}</Text><Text style={styles.memoryAnswer}>Saved patient question</Text></View><Pressable accessibilityRole="button" onPress={() => onDelete(memory.id)}><Text style={styles.remove}>Remove</Text></Pressable></View>)}
  </ScrollView></SafeAreaView>;
}

function makeOptions(memory, memories) {
  if (memory.options?.length === 4) return shuffleItems(memory.options);
  const answers = memories.filter((item) => item.id !== memory.id).map((item) => item.answer);
  return [memory.answer, ...answers, 'Not sure yet', 'Something else', 'I would like a hint'].filter((value, index, all) => all.indexOf(value) === index).slice(0, 4).sort(() => Math.random() - 0.5);
}

function Quiz({ memories, onBack }) {
  const [questions, setQuestions] = useState(() => shuffleItems(memories).slice(0, 5));
  const [index, setIndex] = useState(0); const [selected, setSelected] = useState(null); const [score, setScore] = useState(0); const [done, setDone] = useState(false);
  const memory = questions[index];
  const options = useMemo(() => memory ? makeOptions(memory, questions) : [], [memory, questions]);
  if (!questions.length) return <SafeAreaView style={styles.safe}><View style={styles.empty}><Text style={styles.pageTitle}>No quiz yet</Text><Text style={styles.subtitle}>A caregiver can add familiar memories to begin.</Text><Pressable onPress={onBack} style={styles.primary}><Text style={styles.primaryText}>Go back</Text></Pressable></View></SafeAreaView>;
  if (done) return <SafeAreaView style={styles.safe}><View style={styles.empty}><Text style={styles.bigIcon}>🌼</Text><Text style={styles.pageTitle}>Well done!</Text><Text style={styles.subtitle}>You completed {score} of {questions.length} memory questions.</Text><Pressable onPress={() => { setQuestions(shuffleItems(memories).slice(0, 5)); setIndex(0); setScore(0); setSelected(null); setDone(false); }} style={styles.primary}><Text style={styles.primaryText}>Play again</Text></Pressable><Pressable onPress={onBack} style={styles.secondary}><Text style={styles.secondaryText}>Back to home</Text></Pressable></View></SafeAreaView>;
  const choose = (option) => { if (!selected) { setSelected(option); if (option === memory.answer) setScore((value) => value + 1); } };
  const next = () => index === questions.length - 1 ? setDone(true) : (setIndex((value) => value + 1), setSelected(null));
  return <SafeAreaView style={styles.safe}><StatusBar style="dark"/><View style={styles.quiz}><Back text="Patient home" onPress={onBack}/><Text style={styles.eyebrow}>MEMORY TIME · {index + 1} OF {questions.length}</Text>
    <Text style={styles.quizQuestion}>{memory.prompt}</Text><Text style={styles.subtitle}>Take your time. Choose the answer that feels right.</Text>
    <View style={styles.options}>{options.map((option) => { const correct = selected && option === memory.answer; const wrong = selected === option && option !== memory.answer; return <Pressable key={option} accessibilityRole="button" onPress={() => choose(option)} style={[styles.option, correct && styles.correct, wrong && styles.wrong]}><Text style={styles.optionText}>{option}</Text></Pressable>; })}</View>
    {!!selected && <><Text style={selected === memory.answer ? styles.good : styles.correction}>{selected === memory.answer ? 'That’s right. Lovely remembering!' : `The answer is: ${memory.answer}`}</Text><Pressable onPress={next} style={styles.primary}><Text style={styles.primaryText}>{index === questions.length - 1 ? 'Finish quiz' : 'Next question'}</Text></Pressable></>}
  </View></SafeAreaView>;
}

export default function App() {
  const [role, setRole] = useState(null);
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

  let content;
  if (!role) content = <Login onSelect={setRole} />;
  else if (screen === 'builder') content = <Builder memories={memories} onAdd={(newMemories) => setMemories((all) => [...all, ...newMemories])} onDelete={(id) => setMemories((all) => all.filter((memory) => memory.id !== id))} onBack={() => setScreen('home')} />;
  else if (screen === 'quiz') content = <Quiz memories={memories} onBack={() => setScreen('home')} />;
  else if (screen === 'reminders') content = <ReminderCenter roleKey={role} reminders={reminders} responses={responses} onAdd={addReminder} onDelete={deleteReminder} onBack={() => setScreen('home')} />;
  else content = <Landing roleKey={role} memoryCount={memories.length} reminderCount={reminders.length} responseCount={responses.length} onChangeRole={() => { setRole(null); setScreen('home'); }} onBuilder={() => setScreen('builder')} onQuiz={() => setScreen('quiz')} onReminders={() => setScreen('reminders')} />;

  return <>{content}<ReminderPopup reminder={pendingReminder} onRespond={(completed) => recordResponse(pendingReminder, completed, roles[role || 'patient'].label)} /></>;
}

const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:'#F6F8F1'}, login:{flex:1,paddingHorizontal:24,justifyContent:'center'}, brandMark:{alignItems:'center',justifyContent:'center',width:64,height:64,borderRadius:32,backgroundColor:'#DCE9D4',alignSelf:'center'},star:{color:'#356047',fontSize:34},brand:{color:'#23412F',fontSize:30,fontWeight:'700',textAlign:'center',marginTop:16},tagline:{color:'#5E7162',fontSize:16,textAlign:'center',lineHeight:23,marginTop:8},question:{color:'#1E3024',fontSize:24,fontWeight:'700',marginTop:44},helper:{color:'#657367',fontSize:15,marginTop:5,marginBottom:18},roleList:{gap:12},roleButton:{alignItems:'center',backgroundColor:'#FFF',borderColor:'#E0E7DF',borderRadius:18,borderWidth:1,flexDirection:'row',minHeight:94,padding:16},pressed:{opacity:.75,transform:[{scale:.99}]},roleIcon:{fontSize:30,marginRight:14},roleCopy:{flex:1},roleTitle:{color:'#243B2B',fontSize:18,fontWeight:'700'},roleDescription:{color:'#68756C',fontSize:13,lineHeight:19,marginTop:4},chevron:{color:'#52745C',fontSize:32},footer:{color:'#78857B',fontSize:12,textAlign:'center',marginTop:30},page:{padding:24,paddingBottom:42},topbar:{alignItems:'center',flexDirection:'row',justifyContent:'space-between',marginBottom:34},back:{paddingVertical:8,alignSelf:'flex-start'},backText:{color:'#426B50',fontSize:15,fontWeight:'600'},topIcon:{fontSize:32},eyebrow:{color:'#638E70',fontSize:12,fontWeight:'800',letterSpacing:1.3},pageTitle:{color:'#203B2A',fontSize:29,fontWeight:'700',marginTop:8},subtitle:{color:'#647367',fontSize:16,lineHeight:23,marginTop:8},status:{alignItems:'center',backgroundColor:'#E2F0DF',borderRadius:12,flexDirection:'row',marginTop:25,padding:14},statusDot:{color:'#3D8152',fontSize:14,marginRight:9},statusText:{color:'#315D3D',fontSize:14,fontWeight:'600'},sectionTitle:{color:'#263C2C',fontSize:20,fontWeight:'700',marginBottom:12,marginTop:32},card:{backgroundColor:'#FFF',borderColor:'#E1E8E0',borderRadius:16,borderWidth:1,marginBottom:12,padding:17},cardTitle:{color:'#253A2B',fontSize:16,fontWeight:'700'},cardDescription:{color:'#6B786E',fontSize:14,lineHeight:20,marginTop:5,marginBottom:15},action:{alignSelf:'flex-start',backgroundColor:'#356047',borderRadius:9,paddingHorizontal:14,paddingVertical:9},actionText:{color:'#FFF',fontSize:13,fontWeight:'700'},builder:{backgroundColor:'#FFF',borderColor:'#E1E8E0',borderRadius:16,borderWidth:1,marginTop:25,padding:18},inputLabel:{color:'#304C38',fontSize:14,fontWeight:'700',marginBottom:8},input:{backgroundColor:'#F8FAF7',borderColor:'#CEDACF',borderRadius:10,borderWidth:1,color:'#263C2C',fontSize:16,minHeight:50,paddingHorizontal:13,paddingVertical:12,textAlignVertical:'top'},promptInput:{minHeight:82},hint:{color:'#758176',fontSize:12,lineHeight:17,marginBottom:18,marginTop:6},primary:{alignItems:'center',backgroundColor:'#356047',borderRadius:10,marginTop:20,paddingHorizontal:16,paddingVertical:13},disabled:{opacity:.6},primaryText:{color:'#FFF',fontSize:15,fontWeight:'700'},message:{color:'#3C7048',fontSize:13,lineHeight:19,marginTop:12},memory:{alignItems:'center',backgroundColor:'#FFF',borderColor:'#E1E8E0',borderRadius:13,borderWidth:1,flexDirection:'row',marginBottom:10,padding:14},memoryCopy:{flex:1,paddingRight:10},memoryPrompt:{color:'#2B4231',fontSize:15,fontWeight:'700'},memoryAnswer:{color:'#6D7A70',fontSize:13,marginTop:4},remove:{color:'#A44343',fontSize:13,fontWeight:'700'},quiz:{flex:1,padding:24},quizQuestion:{color:'#203B2A',fontSize:29,fontWeight:'700',lineHeight:38,marginTop:19},options:{gap:11,marginTop:32},option:{backgroundColor:'#FFF',borderColor:'#D8E3D7',borderRadius:13,borderWidth:1,minHeight:58,justifyContent:'center',paddingHorizontal:17},optionText:{color:'#2B4231',fontSize:16,fontWeight:'600'},correct:{backgroundColor:'#DDF0DE',borderColor:'#4B8A5A'},wrong:{backgroundColor:'#F7E0DF',borderColor:'#B65B58'},good:{color:'#357243',fontSize:16,fontWeight:'700',marginTop:22,textAlign:'center'},correction:{color:'#87433F',fontSize:16,fontWeight:'700',lineHeight:23,marginTop:22,textAlign:'center'},empty:{flex:1,justifyContent:'center',padding:28},bigIcon:{fontSize:40,textAlign:'center'},secondary:{alignItems:'center',borderColor:'#7F9684',borderRadius:10,borderWidth:1,marginTop:12,paddingHorizontal:16,paddingVertical:13},secondaryText:{color:'#426B50',fontSize:15,fontWeight:'700'},frequencyRow:{flexDirection:'row',gap:10,marginTop:10},frequencyButton:{alignItems:'center',borderColor:'#CEDACF',borderRadius:10,borderWidth:1,flex:1,padding:12},frequencyButtonSelected:{backgroundColor:'#E2F0DF',borderColor:'#4B8A5A'},frequencyText:{color:'#426B50',fontSize:14,fontWeight:'600'},frequencyTextSelected:{color:'#315D3D'},responseHeader:{backgroundColor:'#E2F0DF',borderRadius:10,flexDirection:'row',justifyContent:'space-between',marginBottom:8,padding:12},responseHeaderText:{color:'#315D3D',fontSize:13,fontWeight:'700'},responseRow:{alignItems:'center',backgroundColor:'#FFF',borderColor:'#E1E8E0',borderRadius:12,borderWidth:1,flexDirection:'row',marginBottom:8,padding:12},responseCell:{flex:1,paddingRight:8},responseTitle:{color:'#2B4231',fontSize:14,fontWeight:'700'},responseMeta:{color:'#758176',fontSize:11,marginTop:4},responseValue:{fontSize:14,fontWeight:'800',minWidth:48,textAlign:'right'},responseYes:{color:'#357243'},responseNo:{color:'#A44343'},modalShade:{alignItems:'center',backgroundColor:'rgba(20,35,24,0.48)',flex:1,justifyContent:'center',padding:24},modalCard:{backgroundColor:'#FFF',borderRadius:20,padding:22,width:'100%'},modalTitle:{color:'#203B2A',fontSize:24,fontWeight:'700',marginTop:8}
});
