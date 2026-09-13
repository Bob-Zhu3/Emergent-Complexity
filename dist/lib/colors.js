export const ageScale = [
  { age: 1, color: '#ffffff' },
  { age: 4, color: '#ff9829' },
  { age: 16, color: '#ffe761' },
  { age: 32, color: '#7ae34d' },
  { age: 64, color: '#41d9d6' },
  { age: 128, color: '#539cff' }
];

function interpolate(age) {
  const upper = ageScale.findIndex(stop => stop.age >= age);
  if (upper === 0) return ageScale[0].color;
  const a = ageScale[upper - 1], b = ageScale[upper];
  const fraction = (Math.log2(age) - Math.log2(a.age)) / (Math.log2(b.age) - Math.log2(a.age));
  const channels = [1, 3, 5].map(offset => {
    const start = parseInt(a.color.slice(offset, offset + 2), 16);
    const end = parseInt(b.color.slice(offset, offset + 2), 16);
    return Math.round(start + (end - start) * fraction).toString(16).padStart(2, '0');
  });
  return `#${channels.join('')}`;
}

const palette = Array.from({ length: 129 }, (_, age) => age ? interpolate(age) : '#0d181c');

export function ageColor(age) {
  return palette[Math.max(0, Math.min(128, Math.floor(age)))];
}
