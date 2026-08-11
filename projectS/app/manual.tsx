/**
 * MANUAL DE JOGO — tudo o que o jogo faz e onde está.
 *
 * Aberto a partir de Clube › Definições. Capítulos que se abrem e fecham, com
 * pesquisa por cima: um manual de 50 entradas sem pesquisa é um manual que
 * ninguém lê até ao fim.
 *
 * Cada entrada diz TAMBÉM onde a coisa vive na app ("Tática › Bolas paradas"),
 * porque a pergunta que traz alguém aqui quase nunca é "o que é isto?" — é
 * "onde é que eu carrego para fazer isto?".
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { MANUAL, MANUAL_ENTRIES, ManualEntry } from '../src/ui/manual';
import { useT } from '../src/ui/i18n';
import { theme } from '../src/ui/theme';
import { Screen } from './components';

export default function Manual() {
  const t = useT();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(MANUAL[0]?.id ?? null);

  const q = query.trim().toLowerCase();

  // A pesquisa corre sobre o TEXTO TRADUZIDO, não sobre as chaves: quem procura
  // "lesão" está a escrever no idioma em que está a jogar.
  const chapters = useMemo(() => {
    if (!q) return MANUAL.map((c) => ({ chapter: c, entries: c.entries }));
    return MANUAL
      .map((c) => ({
        chapter: c,
        entries: c.entries.filter((entry) => {
          const hay = `${t(entry.titleKey)} ${t(entry.bodyKey)} ${entry.whereKey ? t(entry.whereKey) : ''}`;
          return hay.toLowerCase().includes(q);
        }),
      }))
      .filter((x) => x.entries.length > 0);
  }, [q, t]);

  const hits = chapters.reduce((n, c) => n + c.entries.length, 0);

  return (
    <Screen>
      <Stack.Screen options={{ title: t('manual.title') }} />
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>{t('manual.intro', { n: MANUAL_ENTRIES })}</Text>

        <TextInput
          style={styles.search}
          placeholder={t('manual.search')}
          placeholderTextColor={theme.colors.textDim}
          value={query}
          onChangeText={setQuery}
        />
        {q ? (
          <Text style={styles.hits}>
            {hits > 0 ? t('manual.hits', { n: hits }) : t('manual.noHits')}
          </Text>
        ) : null}

        {chapters.map(({ chapter, entries }) => {
          // Com pesquisa ativa mostra-se tudo aberto: esconder resultados atrás
          // de um toque é a maneira mais rápida de fazer uma pesquisa parecer
          // partida.
          const isOpen = !!q || open === chapter.id;
          return (
            <View key={chapter.id} style={styles.chapter}>
              <Pressable
                style={styles.chapterHead}
                onPress={() => setOpen(isOpen && !q ? null : chapter.id)}
              >
                <Text style={styles.chapterIcon}>{chapter.icon}</Text>
                <Text style={styles.chapterTitle}>{t(chapter.titleKey)}</Text>
                <Text style={styles.chapterCount}>{entries.length}</Text>
                <Text style={styles.chevron}>{isOpen ? '▴' : '▾'}</Text>
              </Pressable>
              {isOpen ? entries.map((entry) => <Entry key={entry.titleKey} entry={entry} />) : null}
            </View>
          );
        })}

        <Pressable style={styles.replayBtn} onPress={() => router.back()}>
          <Text style={styles.replayText}>{t('manual.close')}</Text>
        </Pressable>
        <View style={{ height: theme.spacing(3) }} />
      </ScrollView>
    </Screen>
  );
}

function Entry({ entry }: { entry: ManualEntry }) {
  const t = useT();
  return (
    <View style={styles.entry}>
      <Text style={styles.entryTitle}>{t(entry.titleKey)}</Text>
      {entry.whereKey ? (
        <Text style={styles.entryWhere}>📍 {t(entry.whereKey)}</Text>
      ) : null}
      <Text style={styles.entryBody}>{t(entry.bodyKey)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  intro: {
    color: theme.colors.textDim, fontSize: theme.font.small,
    marginTop: theme.spacing(1.5), marginBottom: theme.spacing(1),
  },
  search: {
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.sm, color: theme.colors.text, fontSize: theme.font.body,
    paddingHorizontal: theme.spacing(1.5), paddingVertical: theme.spacing(1),
  },
  hits: {
    color: theme.colors.green, fontSize: theme.font.small, fontWeight: '700',
    marginTop: theme.spacing(0.75),
  },

  chapter: {
    marginTop: theme.spacing(1.25), borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.sm, backgroundColor: theme.colors.surface, overflow: 'hidden',
  },
  chapterHead: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1),
    paddingHorizontal: theme.spacing(1.5), paddingVertical: theme.spacing(1.25),
    backgroundColor: theme.colors.surfaceAlt,
  },
  chapterIcon: { color: theme.colors.green, fontSize: 15, fontWeight: '900', width: 18, textAlign: 'center' },
  chapterTitle: { flex: 1, color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  chapterCount: {
    color: theme.colors.textDim, fontSize: 10, fontWeight: '800',
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 100,
    paddingHorizontal: 7, paddingVertical: 1, overflow: 'hidden',
  },
  chevron: { color: theme.colors.textDim, fontSize: 12, fontWeight: '900' },

  entry: {
    paddingHorizontal: theme.spacing(1.5), paddingVertical: theme.spacing(1.25),
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border,
  },
  entryTitle: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  entryWhere: {
    color: theme.colors.blue, fontSize: theme.font.small, fontWeight: '700',
    marginTop: 2,
  },
  entryBody: {
    color: theme.colors.textDim, fontSize: theme.font.small, lineHeight: 19,
    marginTop: theme.spacing(0.75),
  },

  replayBtn: {
    marginTop: theme.spacing(2), borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.sm, paddingVertical: theme.spacing(1.25), alignItems: 'center',
    backgroundColor: theme.colors.surface,
  },
  replayText: { color: theme.colors.textDim, fontSize: theme.font.body, fontWeight: '800' },
});
