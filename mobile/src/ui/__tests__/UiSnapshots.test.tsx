import { AccessibilityInfo, Appearance, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, renderHook } from '@testing-library/react-native';
import { Sheet } from '../Sheet';
import { Card } from '../Card';
import { Button } from '../Button';
import { Placeholder } from '../Placeholder';
import { Marked } from '../Marked';
import { VerdictLine } from '../VerdictLine';
import { MeaningLine } from '../MeaningLine';
import { Switch } from '../Switch';
import { Row } from '../Row';
import { ReasonRow } from '../ReasonRow';
import { Progress } from '../Progress';
import { Dot } from '../Dot';
import { useReducedMotion } from '../theme';

jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);

const withSafeArea = (e: React.ReactElement) => <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>{e}</SafeAreaProvider>;

const cases: [string, () => React.ReactElement][] = [
  ['sheet', () => withSafeArea(<Sheet title="Reply to Sam" note="Pick one to put in your message box. You send it yourself." mood="thinking" onClose={() => {}}>
    <Card variant="outlined"><Button kind="filled" label="Insert" onPress={() => {}} /><Button kind="text" label="Copy" onPress={() => {}} /></Card>
  </Sheet>)],
  ['sheet-covered', () => withSafeArea(<Sheet title="Reply to Sam" mood="ready" onClose={() => {}} cover={{ title: 'Why this reply', children: <Row title="How it reads" /> }}>
    <Card variant="outlined"><Text>Yes, still on!</Text></Card>
  </Sheet>)],
  ['card-outlined-busy', () => <Card variant="outlined" label="Cleaned up" busy>
    <Button kind="filled" label="Use this" onPress={() => {}} />
    <Button kind="text" label="Copy" onPress={() => {}} />
  </Card>],
  ['card-filled', () => <Card variant="filled" label="Yours"><Marked text="i can bring the stove" hits={[{ start: 2, end: 5, reason: 'A bit stock' }]} /></Card>],
  ['button-disabled', () => <Card variant="outlined"><Button kind="filled" label="Insert" disabled onPress={() => {}} /></Card>],
  ['placeholder', () => <Placeholder />],
  ['marked', () => <Marked text="It's not just fast, but fun." hits={[{ start: 8, end: 21, reason: 'A bit stock' }]} />],
  ['verdict-good', () => <VerdictLine verdict={{ good: true, lead: 'Sounds natural', rest: ' and answers Sam' }} />],
  ['verdict-concern', () => <VerdictLine verdict={{ good: false, lead: 'A bit stock', rest: '' }} />],
  ['verdict-hidden', () => <VerdictLine verdict={null} />],
  ['meaning-ok', () => <MeaningLine check={{ name: 'Meaning', ok: true, reason: '' }} />],
  ['meaning-concern', () => <MeaningLine check={{ name: 'Meaning', ok: false, reason: 'It leaves out “4”' }} />],
  ['meaning-hidden', () => <MeaningLine check={null} />],
  ['switch', () => <Switch value onValueChange={() => {}} />],
  ['switch-off-disabled', () => <Switch value={false} onValueChange={() => {}} disabled />],
  ['row', () => <Row title="Shorter" subtitle="Trims extra words" onPress={() => {}} />],
  ['row-with-switch', () => <Row title="No long dashes" end={<Switch value={false} onValueChange={() => {}} />} />],
  ['reason-ok', () => <ReasonRow ok name="Sounds natural" detail="It could be sent to almost anyone." />],
  ['reason-concern', () => <ReasonRow ok={false} name="A bit stock" detail="On your never-say list: delve" />],
  ['progress', () => <Progress fraction={0.42} />],
  ['dot-idle', () => <Dot mood="idle" size={40} />],
];

test('a failed motion query still settles the UI', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockRejectedValueOnce(new Error('Unavailable'));
  const { result } = await renderHook(useReducedMotion);
  await act(async () => { await Promise.resolve(); });
  expect(result.current).toBe(false);
});

describe.each(['light', 'dark'] as const)('ui components (%s)', scheme => {
  beforeEach(() => { Appearance.setColorScheme(scheme); });
  afterEach(() => { Appearance.setColorScheme('light'); });

  test.each(cases)('%s', async (name, element) => {
    const screen = await render(element());
    await act(async () => { await Promise.resolve(); });
    if (name === 'sheet-covered') await fireEvent.press(screen.getByText('Why?'));
    expect(screen.toJSON()).toMatchSnapshot(`${scheme}/${name}`);
  });
});
