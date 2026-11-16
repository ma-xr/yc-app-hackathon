import { useEffect, useState } from 'react';

import { getPref, PREF, setPref } from '@/lib/prefs';

export const FURS = {
  apricot: { label: 'Apricot', swatch: '#F08A4B' },
  cocoa: { label: 'Cocoa', swatch: '#8C5C42' },
  honey: { label: 'Honey', swatch: '#E2AA4E' },
  rose: { label: 'Rose', swatch: '#E89696' },
  sage: { label: 'Sage', swatch: '#96AC82' },
  cloud: { label: 'Cloud', swatch: '#C8C2BC' },
} as const;

export const ACCESSORIES = {
  none: 'None',
  scarf: 'Scarf',
  beanie: 'Beanie',
  headphones: 'Headphones',
  flower: 'Flower',
} as const;

export const EXPRESSIONS = {
  calm: 'Calm',
  happy: 'Happy',
  sleepy: 'Sleepy',
} as const;

export const GLOWS = {
  ember: { label: 'Ember', color: '#F2A07A' },
  moon: { label: 'Moon', color: '#F3D9A4' },
  dusk: { label: 'Dusk', color: '#C59BE0' },
  sea: { label: 'Sea', color: '#7FC4C9' },
  none: { label: 'None', color: 'transparent' },
} as const;

export const ACCENTS = ['#E0574F', '#3F6FB5', '#F2C14E', '#5E9C6A', '#F6EADB'] as const;

export type Fur = keyof typeof FURS;
export type Accessory = keyof typeof ACCESSORIES;
export type Expression = keyof typeof EXPRESSIONS;
export type Glow = keyof typeof GLOWS;
export type Pose = 'idle' | 'blink' | 'talk' | 'happy';

export type Look = { fur: Fur; accessory: Accessory; accent: string; expression: Expression; glow: Glow };

export const DEFAULT_LOOK: Look = { fur: 'apricot', accessory: 'none', accent: ACCENTS[0], expression: 'calm', glow: 'ember' };

export const ART: Record<Fur, Record<Pose | 'icon', number>> = {
  apricot: {
    idle: require('../../assets/jesse/fur/apricot/idle.png'),
    blink: require('../../assets/jesse/fur/apricot/blink.png'),
    talk: require('../../assets/jesse/fur/apricot/talk.png'),
    happy: require('../../assets/jesse/fur/apricot/happy.png'),
    icon: require('../../assets/jesse/fur/apricot/icon.png'),
  },
  cocoa: {
    idle: require('../../assets/jesse/fur/cocoa/idle.png'),
    blink: require('../../assets/jesse/fur/cocoa/blink.png'),
    talk: require('../../assets/jesse/fur/cocoa/talk.png'),
    happy: require('../../assets/jesse/fur/cocoa/happy.png'),
    icon: require('../../assets/jesse/fur/cocoa/icon.png'),
  },
  honey: {
    idle: require('../../assets/jesse/fur/honey/idle.png'),
    blink: require('../../assets/jesse/fur/honey/blink.png'),
    talk: require('../../assets/jesse/fur/honey/talk.png'),
    happy: require('../../assets/jesse/fur/honey/happy.png'),
    icon: require('../../assets/jesse/fur/honey/icon.png'),
  },
  rose: {
    idle: require('../../assets/jesse/fur/rose/idle.png'),
    blink: require('../../assets/jesse/fur/rose/blink.png'),
    talk: require('../../assets/jesse/fur/rose/talk.png'),
    happy: require('../../assets/jesse/fur/rose/happy.png'),
    icon: require('../../assets/jesse/fur/rose/icon.png'),
  },
  sage: {
    idle: require('../../assets/jesse/fur/sage/idle.png'),
    blink: require('../../assets/jesse/fur/sage/blink.png'),
    talk: require('../../assets/jesse/fur/sage/talk.png'),
    happy: require('../../assets/jesse/fur/sage/happy.png'),
    icon: require('../../assets/jesse/fur/sage/icon.png'),
  },
  cloud: {
    idle: require('../../assets/jesse/fur/cloud/idle.png'),
    blink: require('../../assets/jesse/fur/cloud/blink.png'),
    talk: require('../../assets/jesse/fur/cloud/talk.png'),
    happy: require('../../assets/jesse/fur/cloud/happy.png'),
    icon: require('../../assets/jesse/fur/cloud/icon.png'),
  },
};

let current: Look = DEFAULT_LOOK;
let loaded = false;
const listeners = new Set<(look: Look) => void>();

function publish(look: Look) {
  current = look;
  listeners.forEach((l) => l(look));
}

function parse(raw: string | null): Look {
  try {
    const value = { ...DEFAULT_LOOK, ...(raw ? JSON.parse(raw) : {}) } as Look;
    return {
      fur: value.fur in FURS ? value.fur : DEFAULT_LOOK.fur,
      accessory: value.accessory in ACCESSORIES ? value.accessory : DEFAULT_LOOK.accessory,
      accent: typeof value.accent === 'string' ? value.accent : DEFAULT_LOOK.accent,
      expression: value.expression in EXPRESSIONS ? value.expression : DEFAULT_LOOK.expression,
      glow: value.glow in GLOWS ? value.glow : DEFAULT_LOOK.glow,
    };
  } catch {
    return DEFAULT_LOOK;
  }
}

export function useLook() {
  const [look, setLocal] = useState(current);
  useEffect(() => {
    listeners.add(setLocal);
    if (!loaded) {
      loaded = true;
      void getPref(PREF.look).then((raw) => publish(parse(raw)));
    }
    return () => {
      listeners.delete(setLocal);
    };
  }, []);
  return look;
}

export function saveLook(look: Look) {
  publish(look);
  void setPref(PREF.look, JSON.stringify(look));
}
