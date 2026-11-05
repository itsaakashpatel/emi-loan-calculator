import { nextEmiProps, nextEmiTimeline, type WidgetLoan } from '../src/lib/widget-data';

const loan = (over: Partial<WidgetLoan>): WidgetLoan => ({
  id: 1,
  name: 'Home loan',
  closed: false,
  outstanding: 4_000_000,
  pending: [{ date: '2026-11-10', amount: 43_391 }],
  ...over,
});

describe('nextEmiProps', () => {
  it('shows the earliest unpaid EMI across loans', () => {
    const props = nextEmiProps(
      [loan({}), loan({ id: 2, name: 'Car loan', outstanding: 210_000, pending: [{ date: '2026-11-07', amount: 12_500 }] })],
      '2026-11-05',
    );
    expect(props).toMatchObject({
      state: 'due',
      title: 'Next EMI',
      loanName: 'Car loan',
      amount: '₹12,500',
      dueDate: '7 Nov 2026',
      dueLabel: 'Due in 2 days',
      footer: '₹42,10,000 left on 2 loans',
      url: 'emicalc://loan/2',
    });
  });

  it('says today, tomorrow and late', () => {
    expect(nextEmiProps([loan({})], '2026-11-10').dueLabel).toBe('Due today');
    expect(nextEmiProps([loan({})], '2026-11-09').dueLabel).toBe('Due tomorrow');
    const late = nextEmiProps([loan({})], '2026-11-12');
    expect(late.state).toBe('overdue');
    expect(late.title).toBe('EMI overdue');
    expect(late.dueLabel).toBe('2 days late');
    expect(nextEmiProps([loan({})], '2026-11-11').dueLabel).toBe('1 day late');
  });

  it('covers no loans, all repaid and the app lock', () => {
    expect(nextEmiProps([], '2026-11-05').state).toBe('none');
    expect(nextEmiProps([loan({ closed: true, pending: [] })], '2026-11-05').state).toBe('clear');
    const locked = nextEmiProps([loan({})], '2026-11-05', true);
    expect(locked.state).toBe('locked');
    expect(locked.amount).toBe('');
    expect(JSON.stringify(locked)).not.toContain('43,391');
  });
});

describe('nextEmiTimeline', () => {
  it('gives one entry a day with the count moving down', () => {
    const timeline = nextEmiTimeline([loan({})], '2026-11-05', false, 7);
    expect(timeline.map((e) => e.day)).toEqual([
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
    ]);
    expect(timeline.map((e) => e.props.dueLabel)).toEqual([
      'Due in 5 days',
      'Due in 4 days',
      'Due in 3 days',
      'Due in 2 days',
      'Due tomorrow',
      'Due today',
      '1 day late',
    ]);
  });
});
