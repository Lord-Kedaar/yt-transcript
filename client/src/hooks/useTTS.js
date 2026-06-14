export function useTTS({ text, lang }) {
  let currentAudio = null;

  return {
    async speak() {
      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        console.warn('TTS: no text');
        return;
      }
      if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
      }
      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: text.trim(), lang }),
        });
        if (!res.ok) {
          const err = await res.json();
          console.error('TTS API error:', err);
          throw new Error(err.error || 'TTS generation failed');
        }
        const data = await res.json();
        const audio = new Audio(data.audioUrl);
        currentAudio = audio;
        audio.play();
        audio.addEventListener('ended', () => {
          currentAudio = null;
        });
        audio.addEventListener('error', () => {
          currentAudio = null;
        });
      } catch (err) {
        console.error('TTS error:', err);
        throw err;
      }
    },
  };
}
