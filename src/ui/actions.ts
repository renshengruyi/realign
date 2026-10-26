import type { RhythmItem } from '../domain/types';
import { patchDay, today } from '../platform/store';
import { openSheet, openTool } from './nav';
import { startSitStand } from './sitstand';

export interface ItemAction {
  label: string;
  icon: string;
  run: () => void;
}

/** The main thing to do for a rhythm item, and sometimes a second, lighter one. */
export function actionsFor(item: RhythmItem): ItemAction[] {
  switch (item.kind) {
    case 'wake':
    case 'checkin-am':
      return [{ label: '晨间打卡', icon: 'sun', run: () => openSheet('checkin-am') }];
    case 'meditate-am':
      return [{ label: '开始冥想', icon: 'play', run: () => openTool('meditate', { practice: 'am-anchor', slot: 'am' }) }];
    case 'meditate-pm':
      return [{ label: '开始冥想', icon: 'play', run: () => openTool('meditate', { practice: 'pm-open', slot: 'pm' }) }];
    case 'meal':
      return [
        { label: '开始吃饭计时', icon: 'timer', run: () => openTool('meal', { type: item.mealType }) },
        { label: '补记', icon: 'plus', run: () => openSheet('meal', { type: item.mealType ?? 'snack' }) },
      ];
    case 'walk':
      return [{ label: '记散步', icon: 'walk', run: () => openSheet('move', { kind: 'walk', minutes: item.durationMin ?? 15 }) }];
    case 'focus':
      return [{ label: '开始坐站节拍', icon: 'timer', run: () => startSitStand() }];
    case 'nap':
      return [{ label: '开始午睡训练', icon: 'play', run: () => openTool('nap') }];
    case 'exposure':
      return [{ label: '开始暴露练习', icon: 'play', run: () => openTool('exposure') }];
    case 'exercise':
    case 'posture':
      return [
        { label: '开始跟练', icon: 'play', run: () => openSheet('routines') },
        { label: '补记', icon: 'plus', run: () => openSheet('move', { kind: 'exercise', minutes: item.durationMin ?? 30 }) },
      ];
    case 'shutdown':
      return [{ label: '收工', icon: 'pen', run: () => openSheet('shutdown') }];
    case 'checkin-pm':
      return [{ label: '晚间打卡', icon: 'moon', run: () => openSheet('checkin-pm') }];
    case 'screen-off':
      return [
        {
          label: '放下了',
          icon: 'check',
          run: () => void patchDay(today.value, { habits: { screenOff: true } }),
        },
        { label: '记阅读', icon: 'book', run: () => openSheet('move', { kind: 'read', minutes: 20 }) },
      ];
    case 'read':
      return [{ label: '记阅读', icon: 'book', run: () => openSheet('move', { kind: 'read', minutes: item.durationMin ?? 20 }) }];
    case 'bed':
      return [{ label: '夜里冲动来了', icon: 'moon', run: () => openTool('night') }];
    case 'tuina':
      return [{ label: '记录推拿', icon: 'hand', run: () => openSheet('tuina') }];
    default:
      return [];
  }
}
