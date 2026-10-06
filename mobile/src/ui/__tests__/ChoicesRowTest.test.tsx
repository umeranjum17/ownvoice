import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
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

test('all five rewrite options sit in one unbroken row', async () => {
  const screen = await render(<Choices options={FIVE} value={null} onPick={() => {}} />);
  // Every option is reachable as its own button: nothing stranded or dropped.
  for (const label of FIVE) expect(screen.getByRole('button', { name: label })).toBeTruthy();

  const bars: Node[] = [];
  walk(screen.toJSON(), n => { if (n.type === 'View' && n.props.accessibilityRole === undefined && flatStyle(n).flexDirection === 'row') bars.push(n); });
  expect(bars).toHaveLength(1);
  // Wraps onto balanced rows with content-based sizing: no truncation, no stranded single option.
  expect(flatStyle(bars[0]).flexWrap).toBe('wrap');
});

test('each option shares the row and keeps its label on one line', async () => {
  const picked: string[] = [];
  const screen = await render(<Choices options={FIVE} value="Shorter" onPick={o => picked.push(o)} />);
  const buttons: Node[] = [];
  walk(screen.toJSON(), n => { if (n.type === 'View' && typeof n.props.accessibilityRole === 'string') buttons.push(n); });
  expect(buttons).toHaveLength(FIVE.length);
  for (const button of buttons) expect(flatStyle(button).flex).toBe(undefined);

  const labels: Node[] = [];
  walk(screen.toJSON(), n => { if (n.type === 'Text') labels.push(n); });
  // Content-based sizing: chips wrap onto balanced rows, labels stay fully readable.
  expect(labels).toHaveLength(FIVE.length);
  for (const label of labels) expect(label.props.numberOfLines).toBe(1);
  expect(screen.getByText('Fix spelling')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Firmer' }));
  expect(picked).toEqual(['Firmer']);
});
