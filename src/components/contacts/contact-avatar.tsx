import { Image, View } from 'react-native';

import { avatarSource } from '@/components/contacts/avatar-assets';
import { Avatar } from '@/components/ui';
import { C } from '@/theme/tokens';

export function ContactAvatar({
  name,
  photoUrl,
  avatarKey,
  size = 44,
}: {
  name: string;
  photoUrl?: string | null;
  avatarKey?: string;
  size?: number;
}) {
  const source = photoUrl ? { uri: photoUrl } : avatarKey ? avatarSource(avatarKey) : undefined;
  if (!source) return <Avatar name={name} size={size} />;
  return (
    <View
      accessible={false}
      style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: C.neutralChip }}>
      <Image source={source} style={{ width: size, height: size }} resizeMode="cover" />
    </View>
  );
}
