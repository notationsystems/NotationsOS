import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it } from 'vitest';
import { mockNextNavigation } from '@/test/mocks';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import { StreamExplorer } from './StreamExplorer';

beforeAll(() => mockNextNavigation('/stream'));

describe('StreamExplorer (as-of answers)', () => {
  it('shows a typed refusal with a remedy for lot 7C-104 moisture, and the feed URL that reproduces it', () => {
    render(<StreamExplorer corpus={CARAVAN_CORPUS} initial={{}} />);
    const banner = screen.getByTestId('asof-banner');
    expect(banner).toHaveTextContent('No answer: NO_IDENTITY_LINK');
    expect(screen.getAllByText(/links a sample identifier to LOT-7C-104/).length).toBeGreaterThan(0);
    expect(screen.getByTestId('asof-url')).toHaveTextContent('/api/v1/releases/REL-CAR-2026.09.01/as-of?subject=LOT-7C-104&predicate=condition.moisture');
  });

  it('answers through an identity link for lot 5B-221 with bounds, both clocks, provenance and rights', async () => {
    const user = userEvent.setup();
    render(<StreamExplorer corpus={CARAVAN_CORPUS} initial={{ subject: 'LOT-5B-221', validAt: '2026-08-17T16:00:00Z' }} />);
    expect(screen.getByTestId('asof-banner')).toHaveTextContent('reached through identity link REC-0202');
    const card = screen.getByRole('article', { name: 'Record REC-0201' });
    expect(within(card).getByText('[4.9, 5.3] %')).toBeInTheDocument();
    expect(within(card).getByText('World state valid')).toBeInTheDocument();
    expect(within(card).getByText('Information known by')).toBeInTheDocument();
    expect(within(card).getByText(/Northgate Inspection Services LIMS/)).toBeInTheDocument();
    expect(within(card).getByText(/No model training on certificate content/)).toBeInTheDocument();
    // moving the knowledge time earlier than the correction changes the quantity answer
    await user.selectOptions(screen.getByLabelText('Predicate'), 'quantity.gross');
    expect(screen.getByRole('article', { name: 'Record REC-0204' })).toBeInTheDocument();
  });
});
