import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { Choices } from '../Choices';

const FIVE = ['Shorter', 'Simpler', 'Fix spelling', 'Friendlier', 'Firmer'] as const;

type Node = { type: unknown; props: Record<string, unknown>; children?: unknown };

const walk = (node: unknown, visit: (n: Node) => void): void => {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(n => walk(n, visit)); return; }
  const item = node as Node;
  if (typeof item.type === 'string') visit(item);
  if (item.children !== undefined) walk(item.children, visit);
};

const flatStyle = (node: Node): Record<string, unknown> =>
  StyleSheet.flatten(node.props.style) as Record<string, unknown>;

const chips = (json: unknown): Node[] => {
  const out: Node[] = [];
  walk(json, n => { if (n.type === 'View' && typeof n.props.accessibilityRole === 'string') out.push(n); });
  return out;
};

const barColor = (json: unknown): unknown => {
  let color: unknown;
  walk(json, n => {
    if (n.type === 'View' && n.props.accessibilityRole === undefined && flatStyle(n).flexWrap === 'wrap') {
      color = flatStyle(n).backgroundColor;
    }
  });
  return color;
};

afterEach(() => { (globalThis as Record<string, unknown>).__scheme = 'light'; });

test('dark: every unselected option carries its own fill and edge, distinct from the bar', async () => {
  (globalThis as Record<string, unknown>).__scheme = 'dark';
  const screen = await render(<Choices options={FIVE} value={null} onPick={() => {}} />);
  const bar = barColor(screen.toJSON());
  expect(bar).toBe('#211F26');
  const options = chips(screen.toJSON());
  expect(options).toHaveLength(FIVE.length);
  for (const option of options) {
    const style = flatStyle(option);
    // Own fill, one step up from the bar, with a visible outline edge.
    expect(style.backgroundColor).toBe('#36343B');
    expect(style.borderColor).toBe('#938F99');
    expect(style.borderWidth).toBe(1);
    expect(style.backgroundColor).not.toBe(bar);
  }
});

test('light: every unselected option carries its own fill and edge, distinct from the bar', async () => {
  (globalThis as Record<string, unknown>).__scheme = 'light';
  const screen = await render(<Choices options={FIVE} value={null} onPick={() => {}} />);
  const bar = barColor(screen.toJSON());
  // No tray behind the chips in light: the outline is the affordance now.
  expect(bar).toBe('transparent');
  const options = chips(screen.toJSON());
  expect(options).toHaveLength(FIVE.length);
  for (const option of options) {
    const style = flatStyle(option);
    // Own fill, brightest off the sheet, with a visible outline edge.
    expect(style.backgroundColor).toBe('#FFFFFF');
    expect(style.borderColor).toBe('#79747E');
    expect(style.borderWidth).toBe(1);
    expect(style.backgroundColor).not.toBe(bar);
  }
});

test('selected option uses the primary fill in both themes', async () => {
  for (const scheme of ['light', 'dark']) {
    (globalThis as Record<string, unknown>).__scheme = scheme;
    const screen = await render(<Choices options={FIVE} value="Shorter" onPick={() => {}} />);
    const on = chips(screen.toJSON())[0];
    expect(flatStyle(on).backgroundColor).toBe(scheme === 'dark' ? '#D0BCFF' : '#6750A4');
    expect(flatStyle(on).borderColor).toBe(scheme === 'dark' ? '#D0BCFF' : '#6750A4');
    screen.unmount();
  }
});
