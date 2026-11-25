// Tests for the shared ritual components (resurrection-ritual task 11).
// Uses react-dom/server, so no extra test dependency is needed. The text below is test input
// passed through props. It is not product wording. Click and focus behaviour in a real browser
// is checked in the manual keyboard walk (task 17.1), because the component test tool is Open.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DataSourceBadge } from '../../src/components/DataSourceBadge';
import { FindingRow } from '../../src/components/FindingRow';
import { LiveRegion, liveRegionRole } from '../../src/components/LiveRegion';
import { Notice, noticeRole, type NoticeVariant } from '../../src/components/Notice';
import { StageHeading, focusElement } from '../../src/components/StageHeading';
import { StageIndicator, type StageIndicatorItem } from '../../src/components/StageIndicator';

const stages: readonly StageIndicatorItem[] = [
  { id: 'necropsy', label: 'Stage A', isEnterable: true },
  { id: 'plan', label: 'Stage B', isEnterable: true },
  { id: 'rising', label: 'Stage C', isEnterable: true },
  { id: 'living', label: 'Stage D', isEnterable: false },
];

describe('StageIndicator', () => {
  const html = renderToStaticMarkup(
    <StageIndicator stages={stages} current="plan" ariaLabel="Test stages" onSelect={() => {}} />,
  );

  it('lists the four stages in display order with a text label each', () => {
    const order = ['Stage A', 'Stage B', 'Stage C', 'Stage D'].map((label) => html.indexOf(label));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('exposes only the current stage with aria-current', () => {
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
  });

  it('gives every stage a shape, and a different shape for current, open and not enterable', () => {
    expect(html.match(/<svg/g)).toHaveLength(4);
    expect(html).toContain('stroke-dasharray'); // not enterable
    expect(html).toContain('<circle'); // open
    expect(html).toContain('M8 1 15 8'); // current diamond
  });

  it('marks a stage that cannot be entered with aria-disabled and names the landmark', () => {
    expect(html.match(/aria-disabled="true"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Test stages"');
  });
});

describe('Notice', () => {
  const variants: NoticeVariant[] = ['info', 'warning', 'error', 'success'];

  it('shows the variant label and an icon for every variant', () => {
    for (const variant of variants) {
      const html = renderToStaticMarkup(
        <Notice variant={variant} variantLabel={`label-${variant}`}>
          body
        </Notice>,
      );
      expect(html).toContain(`label-${variant}`);
      expect(html).toContain('<svg');
      expect(html).toContain(`notice--${variant}`);
    }
  });

  it('uses the alert role for errors, status for success and no live role otherwise', () => {
    expect(noticeRole('error')).toBe('alert');
    expect(noticeRole('success')).toBe('status');
    expect(noticeRole('info')).toBeUndefined();
    expect(noticeRole('warning')).toBeUndefined();
  });

  it('uses a different icon for each variant', () => {
    const icons = variants.map((variant) =>
      renderToStaticMarkup(
        <Notice variant={variant} variantLabel="x">
          y
        </Notice>,
      ).match(/<svg.*<\/svg>/)?.[0],
    );
    expect(new Set(icons).size).toBe(4);
  });
});

describe('DataSourceBadge', () => {
  it('shows the given label, a shape, and the exact time as a title', () => {
    const html = renderToStaticMarkup(
      <DataSourceBadge source="cache" label="test label" timeIso="2026-01-01T00:00:00Z" />,
    );
    expect(html).toContain('test label');
    expect(html).toContain('<svg');
    expect(html).toContain('title="2026-01-01T00:00:00Z"');
  });

  it('uses a different shape for live, saved copy and demo', () => {
    const shapes = (['live', 'cache', 'demo'] as const).map((source) =>
      renderToStaticMarkup(<DataSourceBadge source={source} label="x" />).match(/<svg.*<\/svg>/)?.[0],
    );
    expect(new Set(shapes).size).toBe(3);
  });
});

describe('FindingRow', () => {
  it('keeps the fact and the interpretation in separate labelled elements', () => {
    const html = renderToStaticMarkup(
      <ul>
        <FindingRow
          label="L"
          fact="the fact"
          status="available"
          interpretation={{ label: 'note label', text: 'the reading' }}
        />
      </ul>,
    );
    expect(html).toContain('finding-row__fact">the fact<');
    expect(html).toContain('finding-row__interpretation');
    expect(html).toContain('note label');
    expect(html.indexOf('the fact')).toBeLessThan(html.indexOf('the reading'));
  });

  it('shows the step marker with an icon only when given', () => {
    const withStep = renderToStaticMarkup(
      <ul>
        <FindingRow label="L" fact="f" status="available" stepMarker="leads to a step" />
      </ul>,
    );
    const without = renderToStaticMarkup(
      <ul>
        <FindingRow label="L" fact="f" status="available" />
      </ul>,
    );
    expect(withStep).toContain('leads to a step');
    expect(withStep).toContain('finding-row__step-icon');
    expect(without).not.toContain('finding-row__step');
  });

  it('shows a status shape for available, unavailable and not-applicable findings', () => {
    const shapes = (['available', 'unavailable', 'not-applicable'] as const).map((status) =>
      renderToStaticMarkup(
        <ul>
          <FindingRow label="L" fact="f" status={status} />
        </ul>,
      ).match(/<svg.*?<\/svg>/)?.[0],
    );
    expect(new Set(shapes).size).toBe(3);
  });

  it('renders untrusted text as plain text', () => {
    const html = renderToStaticMarkup(
      <ul>
        <FindingRow label="L" fact="<img src=x onerror=alert(1)>" status="available" />
      </ul>,
    );
    expect(html).not.toContain('<img');
  });
});

describe('LiveRegion', () => {
  it('uses the status role with polite for progress and the alert role for errors', () => {
    expect(liveRegionRole('polite')).toBe('status');
    expect(liveRegionRole('alert')).toBe('alert');
    expect(renderToStaticMarkup(<LiveRegion kind="polite" message="m" />)).toContain('aria-live="polite"');
    expect(renderToStaticMarkup(<LiveRegion kind="alert" message="m" />)).toContain('role="alert"');
  });

  it('renders the region even when there is no message', () => {
    const html = renderToStaticMarkup(<LiveRegion kind="polite" message={null} />);
    expect(html).toContain('role="status"');
  });

  it('can hide the text visually only', () => {
    expect(renderToStaticMarkup(<LiveRegion kind="polite" message="m" isVisuallyHidden />)).toContain('live-region--hidden');
  });
});

describe('StageHeading and focus', () => {
  it('renders a heading that script can focus but that is not a tab stop', () => {
    const html = renderToStaticMarkup(<StageHeading stageKey="plan">Heading text</StageHeading>);
    expect(html).toContain('<h2');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('Heading text');
  });

  it('focusElement focuses the element and ignores null', () => {
    const element = { focus: vi.fn() };
    focusElement(element);
    expect(element.focus).toHaveBeenCalledTimes(1);
    expect(() => focusElement(null)).not.toThrow();
  });
});
