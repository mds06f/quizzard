(function(global) {
  let recognition = null;
  let synth = window.speechSynthesis;
  let isNarratingEnabled = false;
  let isListeningEnabled = false;

  const SpeechRecognition = global.SpeechRecognition || global.webkitSpeechRecognition;

  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      isListeningEnabled = true;
      updateUIStatus(true);
    };

    recognition.onresult = (event) => {
      const resultIndex = event.resultIndex;
      const transcript = event.results[resultIndex][0].transcript.trim().toLowerCase();
      console.log('[SpeechEngine] Voice command heard:', transcript);
      handleVoiceCommand(transcript);
    };

    recognition.onerror = (event) => {
      console.error('[SpeechEngine] Recognition error:', event.error);
      if (isListeningEnabled && event.error !== 'not-allowed') {
        try {
          recognition.start();
        } catch (e) {}
      }
    };

    recognition.onend = () => {
      console.log('[SpeechEngine] Recognition session ended');
      if (isListeningEnabled) {
        try {
          recognition.start();
        } catch (e) {}
      } else {
        updateUIStatus(false);
      }
    };
  }

  function handleVoiceCommand(phrase) {
    if (phrase.includes('one') || phrase === '1' || phrase.includes('option 1') || phrase.includes('option a') || phrase === 'a') {
      clickOption(1);
    } else if (phrase.includes('two') || phrase === '2' || phrase.includes('option 2') || phrase.includes('option b') || phrase === 'b') {
      clickOption(2);
    } else if (phrase.includes('three') || phrase === '3' || phrase.includes('option 3') || phrase.includes('option c') || phrase === 'c') {
      clickOption(3);
    } else if (phrase.includes('four') || phrase === '4' || phrase.includes('option 4') || phrase.includes('option d') || phrase === 'd') {
      clickOption(4);
    } else if (phrase.includes('next') || phrase.includes('proceed') || phrase.includes('continue')) {
      clickNext();
    } else if (phrase.includes('submit') || phrase.includes('finish') || phrase.includes('done')) {
      clickSubmit();
    } else if (phrase.includes('pause') || phrase.includes('stop')) {
      clickPause();
    }
  }

  function clickOption(index) {
    const activeQDiv = document.querySelector(`#quiz-container > div:not(.hidden)`);
    if (!activeQDiv) return;
    const cards = activeQDiv.querySelectorAll('.option-card');
    if (cards && cards[index - 1]) {
      console.log(`[SpeechEngine] Selecting option ${index}`);
      cards[index - 1].click();
    }
  }

  function clickNext() {
    const actionBtn = document.getElementById('action-btn');
    if (actionBtn && !actionBtn.disabled && actionBtn.textContent.includes('Next Question')) {
      console.log('[SpeechEngine] Proceeding to next question');
      actionBtn.click();
    }
  }

  function clickSubmit() {
    const actionBtn = document.getElementById('action-btn');
    if (actionBtn && !actionBtn.disabled && actionBtn.textContent.includes('Submit Quiz')) {
      console.log('[SpeechEngine] Submitting quiz form');
      actionBtn.click();
      setTimeout(() => {
        const confirmBtn = document.querySelector('button[onclick="confirmFinalSubmission()"]');
        if (confirmBtn) {
          confirmBtn.click();
        }
      }, 500);
    }
  }

  function clickPause() {
    const pauseBtn = document.getElementById('pause-quiz-btn');
    if (pauseBtn) {
      console.log('[SpeechEngine] Pausing quiz timer');
      pauseBtn.click();
    } else {
      if (typeof global.togglePauseQuiz === 'function') {
        global.togglePauseQuiz();
      }
    }
  }

  function updateUIStatus(isActive) {
    const voiceBtn = document.getElementById('voice-command-toggle');
    const voiceStatus = document.getElementById('voice-status-label');
    if (!voiceBtn || !voiceStatus) return;

    if (isActive) {
      voiceBtn.classList.remove('text-stone-400');
      voiceBtn.classList.add('text-emerald-400', 'border-emerald-500/30', 'bg-emerald-950/20');
      voiceStatus.textContent = 'Listening';
      voiceStatus.className = 'hidden sm:inline text-emerald-400';
    } else {
      voiceBtn.classList.add('text-stone-400');
      voiceBtn.classList.remove('text-emerald-400', 'border-emerald-500/30', 'bg-emerald-950/20');
      voiceStatus.textContent = 'Off';
      voiceStatus.className = 'hidden sm:inline text-stone-500';
    }
  }

  const speechEngine = {
    toggleListening() {
      if (!recognition) {
        alert('Speech Recognition is not supported in this browser.');
        return;
      }
      if (isListeningEnabled) {
        this.stopListening();
      } else {
        this.startListening();
      }
    },

    startListening() {
      if (!recognition) return;
      isListeningEnabled = true;
      try {
        recognition.start();
      } catch (e) {
        console.warn('Recognition start error:', e);
      }
    },

    stopListening() {
      isListeningEnabled = false;
      if (recognition) {
        try {
          recognition.stop();
        } catch (e) {}
      }
      updateUIStatus(false);
    },

    speak(text) {
      if (!synth) return;
      synth.cancel();
      if (!isNarratingEnabled) return;

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      synth.speak(utterance);
    },

    stopSpeaking() {
      if (synth) {
        synth.cancel();
      }
    },

    toggleNarration() {
      isNarratingEnabled = !isNarratingEnabled;
      const readAloudBtn = document.getElementById('btn-read-aloud');
      const statusLabel = document.getElementById('narration-status-label');
      if (readAloudBtn && statusLabel) {
        if (isNarratingEnabled) {
          readAloudBtn.classList.remove('text-stone-400');
          readAloudBtn.classList.add('text-amber-400', 'border-amber-500/30', 'bg-amber-950/20');
          statusLabel.textContent = 'Narration On';
          statusLabel.className = 'hidden sm:inline text-amber-400';
          
          // Speak current active question
          const activeQDiv = document.querySelector(`#quiz-container > div:not(.hidden)`);
          if (activeQDiv) {
            const p = activeQDiv.querySelector('p');
            if (p) this.speak(p.textContent);
          }
        } else {
          readAloudBtn.classList.add('text-stone-400');
          readAloudBtn.classList.remove('text-amber-400', 'border-amber-500/30', 'bg-amber-950/20');
          statusLabel.textContent = 'Read Aloud';
          statusLabel.className = 'hidden sm:inline text-stone-500';
          this.stopSpeaking();
        }
      }
    },

    isNarrationEnabled() {
      return isNarratingEnabled;
    },

    isSupported() {
      return !!SpeechRecognition;
    }
  };

  global.speechEngine = speechEngine;
})(typeof window !== 'undefined' ? window : this);
