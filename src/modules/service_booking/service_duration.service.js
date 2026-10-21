import {
  ServiceDurationOption,
  ServiceBufferOption,
  ServiceExecutionMethod,
  ServiceBookingCapacity,
} from '../service_config/service_config.models.js';
import ServiceListing from '../service_listing/service_listing.model.js';

/**
 * Resolves authoritative Step 3 Duration & Execution configuration for a given service listing.
 * Canonical Source: Normalized active records in service_duration_options, service_buffer_options,
 * and service_execution_methods.
 *
 * Enforces business rule:
 * totalOccupancyMinutes = durationMinutes + bufferMinutes
 */
export const resolveServiceDurationConfig = async (listingOrId) => {
  let listing = listingOrId;
  if (typeof listingOrId === 'number' || typeof listingOrId === 'string') {
    listing = await ServiceListing.findOne({
      where: { id: listingOrId, is_deleted: false },
      include: [
        { model: ServiceDurationOption, as: 'duration_option' },
        { model: ServiceDurationOption, as: 'min_duration_option' },
        { model: ServiceBufferOption, as: 'buffer_option' },
        { model: ServiceExecutionMethod, as: 'execution_method' },
        { model: ServiceBookingCapacity, as: 'booking_capacity' },
      ],
    });
  }

  if (!listing) {
    const err = new Error('Service listing not found');
    err.statusCode = 404;
    throw err;
  }

  // 1. Resolve Duration Minutes
  let durationMinutes = 60; // Safe default
  let durationOption = listing.duration_option;

  if (!durationOption && listing.duration_option_id) {
    durationOption = await ServiceDurationOption.findOne({
      where: { id: listing.duration_option_id, is_deleted: false },
    });
  }

  if (durationOption) {
    if (!durationOption.is_active) {
      const err = new Error('Inactive duration option: ID ' + durationOption.id + ' is inactive');
      err.statusCode = 400;
      throw err;
    }
    durationMinutes = Number(durationOption.minutes);
  } else if (listing.duration) {
    // Backward compatibility for legacy duration string (e.g. '60 mins', '2 hours')
    durationMinutes = parseLegacyDurationStringToMinutes(listing.duration);
  }

  // 2. Resolve Buffer Minutes
  let bufferMinutes = 0; // Default no buffer
  let bufferOption = listing.buffer_option;

  if (!bufferOption && listing.buffer_option_id) {
    bufferOption = await ServiceBufferOption.findOne({
      where: { id: listing.buffer_option_id, is_deleted: false },
    });
  }

  if (bufferOption) {
    if (!bufferOption.is_active) {
      const err = new Error('Inactive buffer option: ID ' + bufferOption.id + ' is inactive');
      err.statusCode = 400;
      throw err;
    }
    bufferMinutes = Number(bufferOption.minutes);
  }

  // 3. Resolve Execution Method
  let executionMethod = listing.execution_method;
  if (!executionMethod && listing.execution_method_id) {
    executionMethod = await ServiceExecutionMethod.findOne({
      where: { id: listing.execution_method_id, is_deleted: false },
    });
  }

  if (executionMethod && !executionMethod.is_active) {
    const err = new Error('Inactive execution method: ID ' + executionMethod.id + ' is inactive');
    err.statusCode = 400;
    throw err;
  }

  // 4. Resolve Capacity
  let capacity = 1;
  let bookingCapacity = listing.booking_capacity;
  if (!bookingCapacity && listing.booking_capacity_id) {
    bookingCapacity = await ServiceBookingCapacity.findOne({
      where: { id: listing.booking_capacity_id, is_deleted: false },
    });
  }
  if (bookingCapacity && bookingCapacity.is_active) {
    capacity = Number(bookingCapacity.capacity) || 1;
  }

  const totalOccupancyMinutes = durationMinutes + bufferMinutes;

  return {
    durationMinutes,
    durationLabel: durationOption?.label || (durationMinutes + ' Mins'),
    durationOptionId: durationOption?.id ? Number(durationOption.id) : null,
    bufferMinutes,
    bufferLabel: bufferOption?.label || (bufferMinutes > 0 ? (bufferMinutes + ' Mins') : 'No Buffer'),
    bufferOptionId: bufferOption?.id ? Number(bufferOption.id) : null,
    executionMethodId: executionMethod?.id ? Number(executionMethod.id) : null,
    executionMethodCode: executionMethod?.code || 'CUSTOMER_LOCATION',
    executionMethodName: executionMethod?.name || 'At Customer Location / Home Visit',
    capacity,
    totalOccupancyMinutes,
  };
};

/**
 * Parses legacy duration string into numeric minutes.
 */
export const parseLegacyDurationStringToMinutes = (str) => {
  if (!str || typeof str !== 'string') return 60;
  const s = str.trim().toLowerCase();
  const numMatch = s.match(/(\d+(\.\d+)?)/);
  if (!numMatch) return 60;
  const val = parseFloat(numMatch[1]);
  if (s.includes('hour') || s.includes('hr')) {
    return Math.round(val * 60);
  }
  if (s.includes('day')) {
    return Math.round(val * 1440);
  }
  return Math.round(val);
};

/**
 * Parses a scheduled_at date and time_slot string into absolute start and end Date objects.
 */
export const parseTimeSlotInterval = (scheduledAt, timeSlotStr, totalOccupancyMinutes = 60) => {
  const baseDate = new Date(scheduledAt);
  if (isNaN(baseDate.getTime())) {
    return { start: null, end: null, occupiedUntil: null };
  }

  let startClock = null;
  let endClock = null;

  if (timeSlotStr && typeof timeSlotStr === 'string') {
    const delimiter = timeSlotStr.includes('–') ? '–' : (timeSlotStr.includes('-') ? '-' : null);
    if (delimiter) {
      const parts = timeSlotStr.split(delimiter).map(p => p.trim());
      if (parts[0]) startClock = parts[0];
      if (parts[1]) endClock = parts[1];
    } else {
      startClock = timeSlotStr.trim();
    }
  }

  let startTime = null;
  if (startClock) {
    startTime = parseClockToDate(baseDate, startClock);
  } else {
    startTime = new Date(baseDate);
  }

  let serviceEndTime = null;
  if (endClock) {
    serviceEndTime = parseClockToDate(baseDate, endClock);
  }

  // If serviceEndTime couldn't be parsed or was invalid, use start + duration
  if (!serviceEndTime || serviceEndTime <= startTime) {
    serviceEndTime = new Date(startTime.getTime() + totalOccupancyMinutes * 60000);
  }

  // Occupied until includes duration + buffer
  const occupiedUntil = new Date(startTime.getTime() + totalOccupancyMinutes * 60000);

  return {
    start: startTime,
    serviceEnd: serviceEndTime,
    occupiedUntil,
  };
};

function parseClockToDate(baseDate, clockStr) {
  const clean = clockStr.trim().toUpperCase();
  const parts = clean.split(' ');
  const timePart = parts[0];
  const amPm = parts.length > 1 ? parts[1] : (clean.includes('PM') ? 'PM' : (clean.includes('AM') ? 'AM' : null));
  const [hStr, mStr] = timePart.split(':');
  let hours = parseInt(hStr, 10);
  const minutes = parseInt(mStr || '0', 10);

  if (amPm === 'PM' && hours < 12) hours += 12;
  if (amPm === 'AM' && hours === 12) hours = 0;

  const d = new Date(baseDate);
  d.setHours(hours, minutes, 0, 0);
  return d;
}
