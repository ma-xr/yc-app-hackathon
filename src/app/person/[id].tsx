import { Redirect, useLocalSearchParams, type Href } from 'expo-router';

export default function PersonRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={`/contacts/${id}` as Href} />;
}
