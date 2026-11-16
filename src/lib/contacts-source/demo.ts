import type { ContactsSource } from './index';

export const demoSource: ContactsSource = {
  id: 'demo',
  label: 'Demo contacts',
  sync: (client) => client.seedDemo(),
};
