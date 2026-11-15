import {
  BricolageGrotesque_700Bold,
} from '@expo-google-fonts/bricolage-grotesque';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import {
  Nunito_500Medium,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
} from '@expo-google-fonts/nunito';
import { useFonts } from 'expo-font';

export function useJesseFonts() {
  const [loaded, error] = useFonts({
    BricolageGrotesque_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Fraunces_600SemiBold,
    Nunito_500Medium,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });
  return loaded || !!error;
}
