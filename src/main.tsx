import { render } from 'preact';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/screens.css';
import { initStore } from './platform/store';
import { App } from './ui/App';
import { startReminders } from './ui/reminders';

render(<App />, document.getElementById('app')!);
void initStore();
startReminders();
