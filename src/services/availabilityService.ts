import { AvailabilityResult, SyncraftProfile } from '../types';
import { parseTimeToMinutes, isInWrappingRange, nowInZone } from '../utils/time';

const STATUS_LABELS: Record<AvailabilityResult['status'], string> = {
  available: 'Available ✅',
  outside_work_hours: 'Outside work hours 🌙',
  likely_asleep: 'Likely asleep 💤',
};

export function getAvailability(profile: SyncraftProfile): AvailabilityResult {
  const now = nowInZone(profile.timezone);
  const currentMinutes = now.hour * 60 + now.minute;
  const localTimeString = now.toFormat('h:mm a');

  const sleepStartMin = parseTimeToMinutes(profile.sleepStart);
  const sleepEndMin = parseTimeToMinutes(profile.sleepEnd);
  const workStartMin = parseTimeToMinutes(profile.workStart);
  const workEndMin = parseTimeToMinutes(profile.workEnd);

  let status: AvailabilityResult['status'];

  if (isInWrappingRange(currentMinutes, sleepStartMin, sleepEndMin)) {
    status = 'likely_asleep';
  } else if (isInWrappingRange(currentMinutes, workStartMin, workEndMin)) {
    status = 'available';
  } else {
    status = 'outside_work_hours';
  }

  return {
    localTimeString,
    status,
    statusLabel: STATUS_LABELS[status],
  };
}
