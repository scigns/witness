// @vitest-environment jsdom
/**
 * Behavioural coverage for the per-programme onboarding overlay
 * (`components/onboarding.tsx`) — WEB-NEXT-01. This overlay already exists
 * and is wired into `/workspaces/[id]`; this test verifies its actual
 * behaviour (step navigation, dismiss persistence) rather than assuming it
 * needed to be built.
 */
import { cleanup, render, screen, renderHook, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OnboardingOverlay, useOnboardingVisible } from '@/components/onboarding';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('OnboardingOverlay', () => {
  it('walks five steps in order and reaches a final Start action', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();

    render(
      <OnboardingOverlay
        workspaceName="Coastal Resilience Programme"
        organisationName="Ministry of Environment"
        description="Co-designing a coastal adaptation plan."
        memberCount={12}
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByText(/welcome to coastal resilience programme/i)).toBeInTheDocument();
    expect(screen.getByText(/step 1 of 5/i)).toBeInTheDocument();

    for (let step = 2; step <= 5; step += 1) {
      await user.click(screen.getByRole('button', { name: /next/i }));
      expect(screen.getByText(new RegExp(`step ${step} of 5`, 'i'))).toBeInTheDocument();
    }

    expect(screen.getByText(/you.re ready/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^start$/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('lets Skip dismiss from any step without requiring all five', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();

    render(
      <OnboardingOverlay
        workspaceName="Coastal Resilience Programme"
        organisationName="Ministry of Environment"
        description={null}
        memberCount={1}
        onDismiss={onDismiss}
      />,
    );

    await user.click(screen.getByRole('button', { name: /skip/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('never claims a capability the product does not have', async () => {
    const user = userEvent.setup();

    render(
      <OnboardingOverlay
        workspaceName="Coastal Resilience Programme"
        organisationName="Ministry of Environment"
        description={null}
        memberCount={1}
        onDismiss={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText(/a description hasn.t been added/i)).toBeInTheDocument();
  });
});

describe('useOnboardingVisible', () => {
  it('is visible the first time a workspace is opened, then stays dismissed', () => {
    const { result, rerender } = renderHook(
      (workspaceId: string) => useOnboardingVisible(workspaceId),
      {
        initialProps: 'ws-1',
      },
    );

    expect(result.current[0]).toBe(true);

    act(() => {
      result.current[1]();
    });
    expect(result.current[0]).toBe(false);
    expect(window.localStorage.getItem('witness.onboarding.completed.ws-1')).toBe('1');

    rerender('ws-1');
    expect(result.current[0]).toBe(false);
  });

  it('tracks visibility per workspace, not globally', () => {
    window.localStorage.setItem('witness.onboarding.completed.ws-1', '1');

    const { result } = renderHook((workspaceId: string) => useOnboardingVisible(workspaceId), {
      initialProps: 'ws-2',
    });

    expect(result.current[0]).toBe(true);
  });
});
