import { loaded, mode } from '../platform/store';
import { Icon } from './components/Icon';
import { Toasts } from './components/Toasts';
import { BrandSeal } from './components/TopBar';
import { go, sheet, tab, TABS, tool } from './nav';
import { CoachScreen } from './screens/Coach';
import { PracticeScreen } from './screens/Practice';
import { RecordScreen } from './screens/Record';
import { TodayScreen } from './screens/Today';
import { TrendsScreen } from './screens/Trends';
import { SheetHost } from './SheetHost';
import { SitStandPill } from './tools/SitStand';
import { ToolHost } from './ToolHost';

function Screen() {
  switch (tab.value) {
    case 'practice':
      return <PracticeScreen />;
    case 'trends':
      return <TrendsScreen />;
    case 'record':
      return <RecordScreen />;
    case 'coach':
      return <CoachScreen />;
    default:
      return <TodayScreen />;
  }
}

function Loading() {
  return (
    <div class="page" style={{ paddingTop: '30vh', justifyItems: 'center' }} role="status">
      <BrandSeal />
      <p class="small muted">正在打开你的记录…</p>
    </div>
  );
}

function NavItems() {
  return (
    <>
      {TABS.map((t) => (
        <button type="button" key={t.id} class="nav-item" aria-current={tab.value === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
          <Icon name={t.icon} />
          <span>{t.label}</span>
        </button>
      ))}
    </>
  );
}

export function App() {
  const ready = mode.value !== 'loading' && loaded.value;
  return (
    <div class="app">
      <nav class="rail" aria-label="主导航">
        <span class="brand">
          <BrandSeal />
          回正
        </span>
        <NavItems />
        <div class="rail-foot">
          <p class="xs muted">睡 · 食 · 动 · 静</p>
        </div>
      </nav>
      <main class="main">{ready ? <Screen /> : <Loading />}</main>
      <nav class="bottom-nav" aria-label="主导航">
        <NavItems />
      </nav>
      {ready && !tool.value ? <SitStandPill /> : null}
      {ready && sheet.value ? <SheetHost spec={sheet.value} /> : null}
      {ready && tool.value ? <ToolHost spec={tool.value} /> : null}
      <Toasts />
    </div>
  );
}
