import { Audio } from 'expo-av';

let soundCache: Record<string, Audio.Sound> = {};

async function playSound(name: string, uri: string, volume: number = 0.5) {
  try {
    if (soundCache[name]) {
      try { await soundCache[name].stopAsync(); } catch {}
      try { await soundCache[name].unloadAsync(); } catch {}
    }
    const { sound } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: true, volume, isLooping: false }
    );
    soundCache[name] = sound;
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync().catch(() => {});
        delete soundCache[name];
      }
    });
  } catch (e) {
    console.warn('Sound play failed:', name, e);
  }
}

export async function initAudio() {
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: false,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });
  } catch {}
}

export async function playMahjongShuffle() {
  await playSound('mj_shuffle', 'https://cdn.freesound.org/previews/240/240776_4107740-lq.mp3', 0.4);
}

export async function playMahjongWin() {
  await playSound('mj_win', 'https://cdn.freesound.org/previews/270/270402_5123851-lq.mp3', 0.5);
}

export async function playMahjongLose() {
  await playSound('mj_lose', 'https://cdn.freesound.org/previews/362/362205_6629901-lq.mp3', 0.4);
}

export async function playMahjongChoiceWaiting() {
  await playSound('mj_choice', 'https://cdn.freesound.org/previews/411/411089_5121236-lq.mp3', 0.35);
}

export async function playTimerComplete() {
  await playSound('timer_done', 'https://cdn.freesound.org/previews/320/320655_5260872-lq.mp3', 0.5);
}

export async function playRatingSubmitted() {
  await playSound('rating', 'https://cdn.freesound.org/previews/270/270402_5123851-lq.mp3', 0.4);
}

export async function playAssistantOpen() {
  await playSound('assistant', 'https://cdn.freesound.org/previews/242/242501_4284968-lq.mp3', 0.35);
}

export async function cleanupSounds() {
  for (const [_key, sound] of Object.entries(soundCache)) {
    try { await sound.unloadAsync(); } catch {}
  }
  soundCache = {};
}
