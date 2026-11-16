import type { ContactsSource } from './index';

export const demoSource: ContactsSource = {
  id: 'demo',
  label: 'Demo memories',
  async sync(client) {
    await client.loadDemo();
    return { added: 0, updated: 0, total: 0 };
  },
};
