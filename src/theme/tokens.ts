import { Platform } from 'react-native';

export const C = {
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
} as const;

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

export const ORB_STOPS = [
  { offset: '0%', color: '#FFFFFF' },
  { offset: '16%', color: '#D4CCFF' },
  { offset: '42%', color: '#8E80F5' },
  { offset: '70%', color: '#5A48D6' },
  { offset: '100%', color: '#2A1F7A' },
] as const;

export const F = {
  display: 'BricolageGrotesque_700Bold',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

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
  cardRadius: 20,
  buttonRadius: 14,
  touch: 44,
  tabBar: 84,
} as const;

export const shadow = Platform.select({
  web: { boxShadow: '0 1px 2px rgba(27,24,48,0.06)' },
  default: {
    shadowColor: '#1B1830',
    shadowOpacity: 0.06,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
}) as object;

export const APP_NAME = 'Jesse';
export const COMPANION_NAME = 'Jesse';
