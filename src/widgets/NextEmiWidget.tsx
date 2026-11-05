import { HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  containerBackground,
  font,
  foregroundStyle,
  lineLimit,
  minimumScaleFactor,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { NextEmiProps } from '../lib/widget-data';

/**
 * Home screen and lock screen widget: the next EMI across every saved loan.
 *
 * The `'widget'` directive makes Babel turn this function into a string that runs inside the widget
 * extension. It can use only its props and the SwiftUI components and modifiers above, which the
 * extension provides as globals: no other imports, no app code. All text arrives pre-formatted.
 */
function NextEmiLayout(props: NextEmiProps, environment: WidgetEnvironment) {
  'widget';
  const accent = props.state === 'overdue' ? '#D64545' : '#1E78AE';
  const hasEmi = props.state === 'due' || props.state === 'overdue';
  const family = environment.widgetFamily;

  if (family === 'accessoryInline') {
    return (
      <Text modifiers={[widgetURL(props.url)]}>
        {hasEmi ? `${props.amount} · ${props.dueLabel}` : props.title}
      </Text>
    );
  }

  if (family === 'accessoryRectangular') {
    return (
      <VStack alignment="leading" spacing={1} modifiers={[widgetURL(props.url)]}>
        <Text modifiers={[font({ size: 13, weight: 'semibold' }), lineLimit(1)]}>{props.title}</Text>
        {hasEmi ? (
          <Text modifiers={[font({ size: 17, weight: 'bold' }), lineLimit(1), minimumScaleFactor(0.6)]}>{props.amount}</Text>
        ) : null}
        <Text modifiers={[font({ size: 12 }), lineLimit(1)]}>{hasEmi ? `${props.dueLabel} · ${props.loanName}` : props.footer}</Text>
      </VStack>
    );
  }

  const background = containerBackground({ type: 'hierarchical', style: 'quinary' }, 'widget');

  if (!hasEmi) {
    return (
      <VStack alignment="leading" spacing={4} modifiers={[background, widgetURL(props.url)]}>
        <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(accent)]}>EMI Calculator</Text>
        <Spacer />
        <Text modifiers={[font({ size: 16, weight: 'bold' }), lineLimit(2)]}>{props.title}</Text>
        <Text modifiers={[font({ size: 12 }), foregroundStyle({ type: 'hierarchical', style: 'secondary' }), lineLimit(3)]}>
          {props.footer}
        </Text>
      </VStack>
    );
  }

  const amountBlock = (
    <VStack alignment="leading" spacing={2}>
      <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(accent)]}>{props.title}</Text>
      <Text modifiers={[font({ size: 26, weight: 'bold', design: 'rounded' }), lineLimit(1), minimumScaleFactor(0.5)]}>
        {props.amount}
      </Text>
      <Text modifiers={[font({ size: 13, weight: 'medium' }), foregroundStyle(accent), lineLimit(1)]}>{props.dueLabel}</Text>
    </VStack>
  );

  const detailBlock = (
    <VStack alignment="leading" spacing={2}>
      <Text modifiers={[font({ size: 13, weight: 'semibold' }), lineLimit(1)]}>{props.loanName}</Text>
      <Text modifiers={[font({ size: 12 }), foregroundStyle({ type: 'hierarchical', style: 'secondary' }), lineLimit(1)]}>
        {props.dueDate}
      </Text>
    </VStack>
  );

  if (family === 'systemMedium') {
    return (
      <HStack alignment="top" spacing={12} modifiers={[background, widgetURL(props.url)]}>
        {amountBlock}
        <Spacer />
        <VStack alignment="trailing" spacing={6}>
          {detailBlock}
          <Spacer />
          <Text modifiers={[font({ size: 11 }), foregroundStyle({ type: 'hierarchical', style: 'secondary' }), lineLimit(2)]}>
            {props.footer}
          </Text>
        </VStack>
      </HStack>
    );
  }

  return (
    <VStack alignment="leading" spacing={4} modifiers={[background, widgetURL(props.url)]}>
      {amountBlock}
      <Spacer />
      {detailBlock}
    </VStack>
  );
}

export const NextEmiWidget = createWidget<NextEmiProps>('NextEmi', NextEmiLayout);
