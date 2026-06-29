/**
 * Generates a short percussive click WAV for use as a metronome sound.
 * Run once: node scripts/generate-click.js
 */
const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;
const DURATION_S = 0.04; // 40ms — long enough to hear, short enough for tight timing
const NUM_SAMPLES = Math.floor(SAMPLE_RATE * DURATION_S);
const FREQUENCY = 1200; // Hz — bright click

const pcm = new Int16Array(NUM_SAMPLES);
for (let i = 0; i < NUM_SAMPLES; i++) {
  const t = i / SAMPLE_RATE;
  const envelope = Math.exp(-t / 0.008); // fast exponential decay (~8ms time constant)
  pcm[i] = Math.round(envelope * Math.sin(2 * Math.PI * FREQUENCY * t) * 32767);
}

// WAV header: 44 bytes + PCM data
const dataBytes = NUM_SAMPLES * 2; // 16-bit = 2 bytes per sample
const buf = Buffer.alloc(44 + dataBytes);

buf.write('RIFF', 0, 'ascii');
buf.writeUInt32LE(36 + dataBytes, 4);
buf.write('WAVE', 8, 'ascii');
buf.write('fmt ', 12, 'ascii');
buf.writeUInt32LE(16, 16);           // fmt chunk size
buf.writeUInt16LE(1, 20);            // PCM
buf.writeUInt16LE(1, 22);            // mono
buf.writeUInt32LE(SAMPLE_RATE, 24);
buf.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
buf.writeUInt16LE(2, 32);            // block align
buf.writeUInt16LE(16, 34);           // bits per sample
buf.write('data', 36, 'ascii');
buf.writeUInt32LE(dataBytes, 40);

for (let i = 0; i < NUM_SAMPLES; i++) {
  buf.writeInt16LE(pcm[i], 44 + i * 2);
}

const outPath = path.join(__dirname, '../assets/audio/click.wav');
fs.writeFileSync(outPath, buf);
console.log(`Generated ${outPath} (${NUM_SAMPLES} samples, ${dataBytes} bytes PCM)`);
