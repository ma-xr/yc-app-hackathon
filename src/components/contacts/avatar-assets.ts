import type { ImageSourcePropType } from 'react-native';

const AVATARS: Record<string, ImageSourcePropType> = {
  p01: require('../../../assets/contacts/p01.jpg'),
  p02: require('../../../assets/contacts/p02.jpg'),
  p03: require('../../../assets/contacts/p03.jpg'),
  p04: require('../../../assets/contacts/p04.jpg'),
  p05: require('../../../assets/contacts/p05.jpg'),
  p06: require('../../../assets/contacts/p06.jpg'),
  p07: require('../../../assets/contacts/p07.jpg'),
  p08: require('../../../assets/contacts/p08.jpg'),
  p09: require('../../../assets/contacts/p09.jpg'),
  p10: require('../../../assets/contacts/p10.jpg'),
  p11: require('../../../assets/contacts/p11.jpg'),
  p12: require('../../../assets/contacts/p12.jpg'),
  p13: require('../../../assets/contacts/p13.jpg'),
  p14: require('../../../assets/contacts/p14.jpg'),
  p15: require('../../../assets/contacts/p15.jpg'),
  p16: require('../../../assets/contacts/p16.jpg'),
  p17: require('../../../assets/contacts/p17.jpg'),
  p18: require('../../../assets/contacts/p18.jpg'),
  p19: require('../../../assets/contacts/p19.jpg'),
  p20: require('../../../assets/contacts/p20.jpg'),
  p21: require('../../../assets/contacts/p21.jpg'),
  p22: require('../../../assets/contacts/p22.jpg'),
  p23: require('../../../assets/contacts/p23.jpg'),
  p24: require('../../../assets/contacts/p24.jpg'),
  p25: require('../../../assets/contacts/p25.jpg'),
  p26: require('../../../assets/contacts/p26.jpg'),
  p27: require('../../../assets/contacts/p27.jpg'),
  p28: require('../../../assets/contacts/p28.jpg'),
  p29: require('../../../assets/contacts/p29.jpg'),
  p30: require('../../../assets/contacts/p30.jpg'),
  p31: require('../../../assets/contacts/p31.jpg'),
  p32: require('../../../assets/contacts/p32.jpg'),
  p33: require('../../../assets/contacts/p33.jpg'),
  p34: require('../../../assets/contacts/p34.jpg'),
  p35: require('../../../assets/contacts/p35.jpg'),
  p36: require('../../../assets/contacts/p36.jpg'),
};

export function avatarSource(key?: string): ImageSourcePropType | undefined {
  return key ? AVATARS[key] : undefined;
}
