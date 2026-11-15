import { Platform } from 'react-native';

const BASE = {
  bg: '#F6F5FB',
  surface: '#FFFFFF',
  ink: '#1B1830',
  inkSoft: '#3B3752',
  muted: '#5E5A72',
  mutedIcon: '#6B6780',
  line: '#E4E1F0',
  divider: '#EEEBF6',
  chipBorder: '#DCD8EC',
  accent: '#5A48D6',
  accentDeep: '#3E2FB0',
  accentTint: '#E7E3FB',
  accentWash: '#EFECFC',
  amberText: '#7A3E06',
  amberTint: '#FCEBD3',
  amberDot: '#B5650F',
  greenText: '#0B5A3E',
  greenTint: '#D6F0E4',
  darkCardMuted: '#B9B4D1',
  disabled: '#B5AFCB',
  orbDeep: '#2A1F7A',
  neutralChip: '#ECEAF4',
};

type Palette = { [K in keyof typeof BASE]: string };

type Theme = {
  colors: Partial<Palette>;
  orb: readonly { offset: string; color: string }[];
  display: string;
  body?: { regular: string; medium: string; semibold: string; bold: string };
  cardRadius: number;
  buttonRadius: number;
  shadow: { color: string; opacity: number; radius: number; y: number };
};

const THEMES: Record<string, Theme> = {
  base: {
    colors: {},
    orb: [
      { offset: '0%', color: '#FFFFFF' },
      { offset: '16%', color: '#D4CCFF' },
      { offset: '42%', color: '#8E80F5' },
      { offset: '70%', color: '#5A48D6' },
      { offset: '100%', color: '#2A1F7A' },
    ],
    display: 'BricolageGrotesque_700Bold',
    cardRadius: 20,
    buttonRadius: 14,
    shadow: { color: '#1B1830', opacity: 0.06, radius: 2, y: 1 },
  },
  A: {
    colors: {
      bg: '#F6F1EA',
      surface: '#FFFCF7',
      ink: '#2E241E',
      inkSoft: '#4A3F37',
      muted: '#7A6C61',
      mutedIcon: '#8A7C70',
      line: '#EADFD2',
      divider: '#F0E7DC',
      chipBorder: '#E3D6C6',
      accent: '#C0613F',
      accentDeep: '#93432A',
      accentTint: '#F6E2D7',
      accentWash: '#FAEDE5',
      darkCardMuted: '#D9C9BA',
      disabled: '#D3C3B5',
      orbDeep: '#7A3420',
      neutralChip: '#F0E8DE',
    },
    orb: [
      { offset: '0%', color: '#FFF8EE' },
      { offset: '18%', color: '#FFD9B8' },
      { offset: '45%', color: '#F2A07A' },
      { offset: '72%', color: '#C0613F' },
      { offset: '100%', color: '#7A3420' },
    ],
    display: 'Fraunces_600SemiBold',
    cardRadius: 26,
    buttonRadius: 22,
    shadow: { color: '#5A3A22', opacity: 0.07, radius: 16, y: 6 },
  },
  B: {
    colors: {
      bg: '#EEECE7',
      surface: '#F9F8F5',
      ink: '#1F2120',
      inkSoft: '#3D403E',
      muted: '#6A6E6B',
      mutedIcon: '#7A7E7B',
      line: '#DEDCD5',
      divider: '#E7E5DF',
      chipBorder: '#D6D3CA',
      accent: '#5F8A55',
      accentDeep: '#3F6637',
      accentTint: '#DFEAD9',
      accentWash: '#E9F0E5',
      darkCardMuted: '#B9BDB6',
      disabled: '#C2C5BD',
      orbDeep: '#2E4A29',
      neutralChip: '#E5E3DC',
    },
    orb: [
      { offset: '0%', color: '#FBFDF6' },
      { offset: '18%', color: '#DCEBC8' },
      { offset: '45%', color: '#A3C48C' },
      { offset: '72%', color: '#5F8A55' },
      { offset: '100%', color: '#2E4A29' },
    ],
    display: 'BricolageGrotesque_700Bold',
    cardRadius: 28,
    buttonRadius: 28,
    shadow: { color: '#2A2D2B', opacity: 0.05, radius: 20, y: 8 },
  },
  C: {
    colors: {
      bg: '#FCF3EE',
      surface: '#FFFFFF',
      ink: '#3A2B2E',
      inkSoft: '#56464A',
      muted: '#8A777B',
      mutedIcon: '#9A878B',
      line: '#F2E1DA',
      divider: '#F6E9E3',
      chipBorder: '#EED8CF',
      accent: '#E0755A',
      accentDeep: '#B5523A',
      accentTint: '#FBE3DA',
      accentWash: '#FDEEE8',
      darkCardMuted: '#E2CDC6',
      disabled: '#E8CFC6',
      orbDeep: '#A8456A',
      neutralChip: '#F7EBE6',
    },
    orb: [
      { offset: '0%', color: '#FFFFFF' },
      { offset: '18%', color: '#FFE2CC' },
      { offset: '45%', color: '#FFB08F' },
      { offset: '72%', color: '#F07F86' },
      { offset: '100%', color: '#A8456A' },
    ],
    display: 'Nunito_800ExtraBold',
    body: {
      regular: 'Nunito_500Medium',
      medium: 'Nunito_600SemiBold',
      semibold: 'Nunito_700Bold',
      bold: 'Nunito_800ExtraBold',
    },
    cardRadius: 24,
    buttonRadius: 24,
    shadow: { color: '#A8456A', opacity: 0.08, radius: 18, y: 6 },
  },
};

const THEME = THEMES[process.env.EXPO_PUBLIC_THEME ?? 'C'] ?? THEMES.base;

export const C = { ...BASE, ...THEME.colors } as Palette;

export const AVATAR_PALETTE = [
  { bg: '#E7E3FB', fg: '#3E2FB0' },
  { bg: '#FCEBD3', fg: '#7A3E06' },
  { bg: '#D6F0E4', fg: '#0B5A3E' },
  { bg: '#DCEBFB', fg: '#0F4C8A' },
  { bg: '#F6DCE8', fg: '#8A1F5A' },
  { bg: '#ECEAF4', fg: '#1B1830' },
] as const;

export function avatarColors(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

export const ORB_STOPS = THEME.orb;

export const F = {
  display: THEME.display,
  ...(THEME.body ?? {
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
  }),
};

export const T = {
  h1: { fontFamily: F.display, fontSize: 30, lineHeight: 33, color: C.ink },
  appName: { fontFamily: F.display, fontSize: 22, lineHeight: 28, color: C.ink },
  companion: { fontFamily: F.display, fontSize: 26, lineHeight: 31, color: C.ink },
  cardTitle: { fontFamily: F.semibold, fontSize: 16, lineHeight: 21, color: C.ink },
  body: { fontFamily: F.regular, fontSize: 15, lineHeight: 21, color: C.inkSoft },
  bodySmall: { fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.inkSoft },
  meta: { fontFamily: F.medium, fontSize: 13, lineHeight: 18, color: C.muted },
  label: {
    fontFamily: F.semibold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.72,
    textTransform: 'uppercase' as const,
    color: C.muted,
  },
  chip: { fontFamily: F.bold, fontSize: 12, lineHeight: 16 },
} as const;

export const S = {
  screenX: 20,
  screenTop: 24,
  gap: 16,
  cardRadius: THEME.cardRadius,
  buttonRadius: THEME.buttonRadius,
  touch: 44,
  tabBar: 84,
} as const;

const SH = THEME.shadow;
const hex = parseInt(SH.color.slice(1), 16);

export const shadow = Platform.select({
  web: { boxShadow: `0 ${SH.y}px ${SH.radius}px rgba(${hex >> 16},${(hex >> 8) & 255},${hex & 255},${SH.opacity})` },
  default: {
    shadowColor: SH.color,
    shadowOpacity: SH.opacity,
    shadowRadius: SH.radius,
    shadowOffset: { width: 0, height: SH.y },
    elevation: 2,
  },
}) as object;

export const APP_NAME = 'Jesse';
export const COMPANION_NAME = 'Jesse';
