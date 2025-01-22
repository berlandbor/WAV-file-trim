const fileInput = document.getElementById('fileInput');
const playButton = document.getElementById('playButton');
const speedControl = document.getElementById('speedControl');
const volumeControl = document.getElementById('volumeControl');
const trimStartControl = document.getElementById('trimStartControl');
const trimEndControl = document.getElementById('trimEndControl');
const loopControl = document.getElementById('loopControl');
const saveButton = document.getElementById('saveButton');
const speedDisplay = document.getElementById('speedDisplay');
const volumeDisplay = document.getElementById('volumeDisplay');
const trimDisplay = document.getElementById('trimDisplay');
const canvas = document.getElementById('waveform');
const canvasCtx = canvas.getContext('2d');

let audioContext, audioBuffer, sourceNode, gainNode;
let trimStart = 0, trimEnd = 0;

// Загрузка файла
fileInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (file) {
    const arrayBuffer = await file.arrayBuffer();
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    trimStart = 0;
    trimEnd = audioBuffer.duration;

    trimStartControl.max = audioBuffer.duration.toFixed(1);
    trimEndControl.max = audioBuffer.duration.toFixed(1);
    trimEndControl.value = audioBuffer.duration.toFixed(1);
    trimDisplay.textContent = `Trim Range: Full`;

    drawWaveform(audioBuffer);
    enableControls();
  }
});

// Воспроизведение обрезанного диапазона
playButton.addEventListener('click', () => {
  if (sourceNode) sourceNode.stop();

  sourceNode = audioContext.createBufferSource();
  gainNode = audioContext.createGain();

  sourceNode.buffer = audioBuffer;
  sourceNode.playbackRate.value = parseFloat(speedControl.value);
  gainNode.gain.value = parseFloat(volumeControl.value);
  sourceNode.loop = loopControl.checked;

  sourceNode.connect(gainNode);
  gainNode.connect(audioContext.destination);

  sourceNode.start(0, trimStart, trimEnd - trimStart);
  sourceNode.onended = () => {
    drawWaveform(audioBuffer);
  };
});

// Обновление начальной точки обрезки
trimStartControl.addEventListener('input', (event) => {
  trimStart = parseFloat(event.target.value);
  if (trimStart >= trimEnd) {
    trimStartControl.value = (trimEnd - 0.1).toFixed(1);
    trimStart = trimEnd - 0.1;
  }
  trimDisplay.textContent = `Trim Range: ${trimStart.toFixed(1)}s - ${trimEnd.toFixed(1)}s`;
  drawWaveform(audioBuffer, trimStart, trimEnd);
});

// Обновление конечной точки обрезки
trimEndControl.addEventListener('input', (event) => {
  trimEnd = parseFloat(event.target.value);
  if (trimEnd <= trimStart) {
    trimEndControl.value = (trimStart + 0.1).toFixed(1);
    trimEnd = trimStart + 0.1;
  }
  trimDisplay.textContent = `Trim Range: ${trimStart.toFixed(1)}s - ${trimEnd.toFixed(1)}s`;
  drawWaveform(audioBuffer, trimStart, trimEnd);
});

// Сохранение обработанного аудио
saveButton.addEventListener('click', async () => {
  if (!audioBuffer) return;

  // Создаем OfflineAudioContext для обработки
  const offlineContext = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    Math.ceil((trimEnd - trimStart) * audioBuffer.sampleRate),
    audioBuffer.sampleRate
  );

  const source = offlineContext.createBufferSource();
  const gainNode = offlineContext.createGain();

  // Устанавливаем буфер и параметры
  source.buffer = audioBuffer;
  source.playbackRate.value = parseFloat(speedControl.value);
  gainNode.gain.value = parseFloat(volumeControl.value);

  source.connect(gainNode);
  gainNode.connect(offlineContext.destination);

  // Запускаем обработку
  source.start(0, trimStart, trimEnd - trimStart);
  const renderedBuffer = await offlineContext.startRendering();

  // Конвертация в WAV
  const wavData = audioBufferToWav(renderedBuffer);

  // Сохранение файла
  const blob = new Blob([wavData], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'processed_audio.wav';
  a.click();

  URL.revokeObjectURL(url);
});

// Рисование волновой формы
function drawWaveform(buffer, start = 0, end = buffer.duration) {
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const startSample = Math.floor(start * sampleRate);
  const endSample = Math.floor(end * sampleRate);
  const visibleData = data.slice(startSample, endSample);
  const step = Math.ceil(visibleData.length / canvas.width);
  const amp = canvas.height / 2;

  canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
  canvasCtx.fillStyle = '#ddd';
  canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
  canvasCtx.lineWidth = 2;
  canvasCtx.strokeStyle = '#007bff';
  canvasCtx.beginPath();

  for (let i = 0; i < canvas.width; i++) {
    const min = Math.min(...visibleData.slice(i * step, (i + 1) * step));
    const max = Math.max(...visibleData.slice(i * step, (i + 1) * step));
    canvasCtx.moveTo(i, amp - min * amp);
    canvasCtx.lineTo(i, amp - max * amp);
  }
  canvasCtx.stroke();
}

// Активация кнопок
function enableControls() {
  playButton.disabled = false;
  saveButton.disabled = false;
}

// Утилита для конвертации в WAV
function audioBufferToWav(buffer) {
  const numOfChan = buffer.numberOfChannels,
    length = buffer.length * numOfChan * 2 + 44,
    bufferData = new ArrayBuffer(length),
    view = new DataView(bufferData),
    channels = [],
    sampleRate = buffer.sampleRate;

  function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + buffer.length * numOfChan * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numOfChan, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true);
  view.setUint16(32, numOfChan * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, buffer.length * numOfChan * 2, true);

  for (let i = 0; i < numOfChan; i++) {
    channels.push(buffer.getChannelData(i));
  }

  let pos = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numOfChan; channel++) {
      const sample = Math.max(-1, Math.min(1, channels[channel][i]));
      view.setInt16(pos, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      pos += 2;
    }
  }

  return bufferData;
}