import { AvailabilityResult, SyncraftProfile } from '../types';

type Status = AvailabilityResult['status'];
type Speed = SyncraftProfile['responseSpeed'];

const ESTIMATES: Record<Status, Record<Speed, string> | string> = {
  likely_asleep: '6 – 10 hours',
  outside_work_hours: '2 – 6 hours',
  available: {
    fast: '30 min – 2 hours',
    medium: '1 – 3 hours',
    slow: '2 – 5 hours',
  },
};

export function getReplyEstimate(status: Status, speed: Speed): string {
  const entry = ESTIMATES[status];
  if (typeof entry === 'string') return entry;
  return entry[speed];
}
