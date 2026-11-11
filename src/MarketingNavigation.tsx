import type { KeyboardEvent } from 'react';

export type MarketingSection = 'home' | 'calendar' | 'studio' | 'review' | 'assets';

export const marketingSections = [
  { id: 'home', label: 'Home', description: 'Your marketing overview' },
  { id: 'calendar', label: 'Calendar', description: 'Campaigns & content' },
  { id: 'studio', label: 'Image Studio', description: 'Create & refine' },
  { id: 'review', label: 'Review', description: 'Content & creative approval' },
  { id: 'assets', label: 'Assets', description: 'Approved for sales' },
] as const;

export function MarketingIcon({ name, className = '' }: { name: MarketingSection | 'arrow' | 'menu' | 'close'; className?: string }) {
  const paths = {
    home: 'm3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
    calendar: 'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Zm2 10h2m4 0h2m-8 4h2',
    studio: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4m-2-2h4',
    review: 'm8 12 3 3 5-6M9 3H5a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1h-4M9 2h6v4H9Z',
    assets: 'M3 7h7l2-3h9v16H3ZM3 11h18',
    arrow: 'M5 12h14m-6-6 6 6-6 6',
    menu: 'M4 6h16M4 12h16M4 18h16',
    close: 'm6 6 12 12M6 18 18 6',
  };
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;
}

export function MarketingNavigation({ section, onChange }: { section: MarketingSection; onChange: (section: MarketingSection, closeDrawer?: boolean) => void }) {
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const moves: Record<string, number> = { ArrowDown: (index + 1) % 5, ArrowUp: (index + 4) % 5, Home: 0, End: 4 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = marketingSections[moves[event.key]].id;
    onChange(next);
    document.getElementById(`marketing-nav-${next}`)?.focus();
  }
  return <div className="marketing-navigation">
    <span className="navigation-label">WORKSPACE</span>
    <div role="tablist" aria-label="Marketing workspace" aria-orientation="vertical">
      {marketingSections.map((item, index) => <button key={item.id} id={`marketing-nav-${item.id}`} type="button" role="tab"
        aria-label={item.label} aria-selected={section === item.id} aria-controls="marketing-panel" tabIndex={section === item.id ? 0 : -1}
        onKeyDown={event => navigate(event, index)} onClick={() => onChange(item.id, true)}>
        <MarketingIcon name={item.id}/><span><strong>{item.label}</strong><small>{item.description}</small></span><span className="navigation-indicator"/>
      </button>)}
    </div>
    <div className="navigation-workflow"><span>THE CREATIVE WORKFLOW</span><p>Plan. Create. Approve.</p><small>One place for every handoff.</small><div><i/><i/><i/></div></div>
  </div>;
}
