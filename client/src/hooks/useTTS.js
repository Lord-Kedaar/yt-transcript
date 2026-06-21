export function useTTS({ initialText = '', lang = 'en' }) {
  let currentAudio = null;
  let _text = initialText;
  let _lang = lang;

  return {
    get text() {
      return _text;
    },
    set text(value) {
      _text = value;
    },
    get lang() {
      return _lang;
    },
    set lang(value) {
      _lang = value;
    },
    async speak() {
      const text = _text;
      const lang = _lang;
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
