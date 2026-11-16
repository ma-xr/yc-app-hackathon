import { useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { Enter, SkeletonCard } from '@/components/motion';
import { PressableScale } from '@/components/pressable-scale';
import { Button, Card, Chip, Divider, EmptyCard, H1, Screen, SectionLabel } from '@/components/ui';
import { fadeIn, fadeOut, layout } from '@/theme/motion';
import { C, F, S, T } from '@/theme/tokens';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

const PLACEHOLDER = '<your-token>';

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function CodeBlock({ title, text }: { title: string; text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = async () => {
    const { action } = await Share.share({ message: text });
    setCopied(action === Share.sharedAction);
  };
  return (
    <Card style={{ gap: 10 }}>
      <Text style={T.cardTitle}>{title}</Text>
      <View style={styles.code}>
        <Text selectable style={styles.codeText}>
          {text}
        </Text>
      </View>
      <Button
        label={copied ? 'Copied' : 'Copy or share'}
        icon={copied ? 'check' : undefined}
        variant="outline"
        compact
        accessibilityLabel={`Copy ${title}`}
        onPress={() => void copy()}
        style={{ alignSelf: 'flex-start' }}
      />
    </Card>
  );
}

export default function McpScreen() {
  const tokens = useQuery(api.mcp.tokens.list);
  const url = useQuery(api.mcp.tokens.serverUrl);
  const create = useMutation(api.mcp.tokens.create);
  const revoke = useMutation(api.mcp.tokens.revoke);

  const [allowWrite, setAllowWrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minted, setMinted] = useState<string | null>(null);
  const [mintedCopied, setMintedCopied] = useState(false);

  const mint = async () => {
    setBusy(true);
    setError(null);
    try {
      const scopes: ('read:memory' | 'write:notes')[] = allowWrite ? ['read:memory', 'write:notes'] : ['read:memory'];
      const result = await create({ label: 'Claude', scopes });
      setMinted(result.token);
      setMintedCopied(false);
    } catch {
      setError("Couldn't create a token just now. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  const confirmRevoke = (tokenId: Id<'mcpTokens'>, label: string) =>
    Alert.alert('Revoke this token?', `${label} will stop working right away.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Revoke', style: 'destructive', onPress: () => void revoke({ tokenId }) },
    ]);

  const serverUrl = url ?? '…';
  const token = minted ?? PLACEHOLDER;
  const header = `Authorization: Bearer ${token}`;
  const claudeCode = `claude mcp add --transport http jesse ${serverUrl} --header "${header}"`;
  const desktop = JSON.stringify(
    { mcpServers: { jesse: { command: 'npx', args: ['-y', 'mcp-remote', serverUrl, '--header', header] } } },
    null,
    2,
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        style={styles.back}>
        <Icon name="chevronLeft" color={C.ink} />
        <Text style={styles.backText}>Back</Text>
      </PressableScale>

      <Enter index={0} style={{ gap: 10 }}>
        <H1>Connect your Claude</H1>
        <Chip tone="green">Live</Chip>
        <Text style={T.body}>
          Your own Claude can read what Jesse remembers: promises, plans, people and follow-ups. Never recordings or
          transcripts, because none are kept.
        </Text>
      </Enter>

      <Enter index={1} style={styles.section}>
        <SectionLabel>Create a token</SectionLabel>
        <Card style={{ gap: 12 }}>
          <PressableScale
            accessibilityRole="switch"
            accessibilityLabel="Allow Claude to add notes"
            accessibilityState={{ checked: allowWrite }}
            haptic="selection"
            scaleTo={0.98}
            onPress={() => setAllowWrite(!allowWrite)}
            style={styles.toggleRow}>
            <View style={[styles.box, allowWrite && styles.boxOn]}>
              {allowWrite ? (
                <Animated.View entering={fadeIn} exiting={fadeOut}>
                  <Icon name="check" size={16} color={C.onAccent} strokeWidth={2.5} />
                </Animated.View>
              ) : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={T.cardTitle}>Allow Claude to add notes</Text>
              <Text style={T.meta}>write:notes. Reading Jesse’s notes (read:memory) is always on.</Text>
            </View>
          </PressableScale>
          <Animated.View layout={layout}>
            <Button label={busy ? 'Creating…' : 'Create token'} disabled={busy} onPress={() => void mint()} />
          </Animated.View>
          {error ? (
            <Animated.Text entering={fadeIn} exiting={fadeOut} layout={layout} style={[T.meta, { color: C.amberText }]}>
              {error}
            </Animated.Text>
          ) : null}
        </Card>
      </Enter>

      {minted ? (
        <Enter>
          <Card style={{ gap: 10, backgroundColor: C.accentWash }}>
            <Text style={T.cardTitle}>Your new token</Text>
            <Text selectable style={styles.codeText}>
              {minted}
            </Text>
            <Text style={T.meta}>You won’t see this again.</Text>
            <Button
              label={mintedCopied ? 'Copied' : 'Copy or share token'}
              icon={mintedCopied ? 'check' : undefined}
              compact
              style={{ alignSelf: 'flex-start' }}
              onPress={async () => {
                const { action } = await Share.share({ message: minted });
                setMintedCopied(action === Share.sharedAction);
              }}
            />
          </Card>
        </Enter>
      ) : null}

      <Enter index={2} style={styles.section}>
        <SectionLabel>Set it up</SectionLabel>
        <CodeBlock title="Claude (custom connector)" text={`URL: ${serverUrl}\n${header}`} />
        <CodeBlock title="Claude Code" text={claudeCode} />
        <CodeBlock title="Claude Desktop config" text={desktop} />
      </Enter>

      <Enter index={3} style={styles.section}>
        <SectionLabel>Active tokens</SectionLabel>
        {tokens === undefined ? (
          <SkeletonCard />
        ) : tokens.length === 0 ? (
          <Animated.View entering={fadeIn} layout={layout}>
            <EmptyCard>No tokens yet. Create one above.</EmptyCard>
          </Animated.View>
        ) : (
          <Animated.View entering={fadeIn} layout={layout}>
            <Card style={{ paddingVertical: 4 }}>
              {tokens.map((t, i) => (
                <Enter key={t._id} index={i}>
                  {i > 0 ? <Divider /> : null}
                  <View style={styles.tokenRow}>
                    <View style={{ flex: 1, gap: 6 }}>
                      <Text style={T.cardTitle}>{t.label}</Text>
                      <Text style={styles.codeText}>{t.prefix}…</Text>
                      <View style={styles.chips}>
                        {t.scopes.map((s) => (
                          <Chip key={s} tone={s === 'write:notes' ? 'amber' : 'accent'}>
                            {s}
                          </Chip>
                        ))}
                      </View>
                      <Text style={T.meta}>
                        Created {formatDate(t.createdAt)} · {t.lastUsedAt ? `last used ${formatDate(t.lastUsedAt)}` : 'never used'}
                      </Text>
                    </View>
                    <Button label="Revoke" variant="outline" compact onPress={() => confirmRevoke(t._id, t.label)} />
                  </View>
                </Enter>
              ))}
            </Card>
          </Animated.View>
        )}
      </Enter>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', minHeight: S.touch, paddingRight: 12, alignSelf: 'flex-start', marginLeft: -8 },
  backText: { fontFamily: F.bold, fontSize: 15, color: C.ink },
  section: { gap: S.gap },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: S.touch },
  box: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: C.chipBorder,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: C.accent, borderColor: C.accent },
  code: { backgroundColor: C.bg, borderRadius: 12, padding: 12 },
  codeText: { fontFamily: 'monospace', fontSize: 12, lineHeight: 18, color: C.ink },
  tokenRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
