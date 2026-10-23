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
 *
 * Supports multiple slot formats:
 *   - "09:00 AM"            -> single start time
 *   - "09:00 AM - 10:00 AM" -> start - end range (dash delimiter)
 *   - "09:00 AM → 10:00 AM" -> start → end range (arrow delimiter)
 *   - "09:00 AM to 10:00 AM"-> start to end range (text delimiter)
 */
export const parseTimeSlotInterval = (scheduledAt, timeSlotStr, totalOccupancyMinutes = 60) => {
  const baseDate = new Date(scheduledAt);
  if (isNaN(baseDate.getTime())) {
    return { start: null, end: null, occupiedUntil: null };
  }

  let startClock = null;
  let endClock = null;

  if (timeSlotStr && typeof timeSlotStr === 'string') {
    const slot = timeSlotStr.trim();

    // Detect delimiter: Unicode arrow '→' (U+2192), ASCII '-', or word 'to'
    // Use regex to handle all variants safely (avoids Unicode encoding issues)
    const arrowMatch = slot.match(/^(.+?)\s*(?:\u2192|->|to)\s*(.+)$/i);
    const dashMatch = !arrowMatch && slot.match(/^(.+?)\s*-\s*(.+)$/);

    if (arrowMatch) {
      startClock = arrowMatch[1].trim();
      endClock = arrowMatch[2].trim();
    } else if (dashMatch) {
      // Only treat as range if both halves look like clock times (contain digits)
      if (/\d/.test(dashMatch[1]) && /\d/.test(dashMatch[2])) {
        startClock = dashMatch[1].trim();
        endClock = dashMatch[2].trim();
      } else {
        startClock = slot;
      }
    } else {
      startClock = slot;
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

  if (isNaN(hours) || isNaN(minutes)) return new Date(baseDate);

  if (amPm === 'PM' && hours < 12) hours += 12;
  if (amPm === 'AM' && hours === 12) hours = 0;

  const d = new Date(baseDate);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

/**
 * Computes authoritative available time slots for a service listing on a given target date.
 */
export const getAvailableSlotsForDate = async (listingId, targetDateStr) => {
  const listing = await ServiceListing.findOne({
    where: { id: listingId, is_deleted: false },
    include: [
      { model: ServiceDurationOption, as: 'duration_option' },
      { model: ServiceBufferOption, as: 'buffer_option' },
      { model: ServiceBookingCapacity, as: 'booking_capacity' },
    ],
  });

  if (!listing) {
    const err = new Error('Service listing not found');
    err.statusCode = 404;
    throw err;
  }

  const durationConfig = await resolveServiceDurationConfig(listing);
  const slotStepMinutes = durationConfig.totalOccupancyMinutes > 0 ? durationConfig.totalOccupancyMinutes : 60;
  const capacity = durationConfig.capacity || 1;

  const targetDate = new Date(targetDateStr);
  if (isNaN(targetDate.getTime())) {
    const err = new Error('Invalid target date format. Expected YYYY-MM-DD');
    err.statusCode = 400;
    throw err;
  }

  const workStartHour = 9;
  const workEndHour = 19;

  const startOfDay = new Date(targetDate);
  startOfDay.setHours(workStartHour, 0, 0, 0);

  const endOfDay = new Date(targetDate);
  endOfDay.setHours(workEndHour, 0, 0, 0);

  const providerId = listing.provider_id;
  const ServiceBooking = (await import('./service_booking.model.js')).default;
  const { Op } = await import('sequelize');

  const dayStart = new Date(targetDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(targetDate);
  dayEnd.setHours(23, 59, 59, 999);

  const existingBookings = await ServiceBooking.findAll({
    where: {
      provider_id: providerId,
      is_deleted: false,
      status: { [Op.in]: ['requested', 'pending', 'accepted', 'confirmed', 'scheduled', 'on_the_way', 'started', 'in_progress'] },
      scheduled_at: { [Op.gte]: dayStart, [Op.lte]: dayEnd },
    },
    attributes: ['id', 'scheduled_at', 'occupied_until', 'time_slot'],
  });

  const slots = [];
  let currentSlotStart = new Date(startOfDay);

  const now = new Date();
  const isToday = now.toDateString() === targetDate.toDateString();

  while (currentSlotStart.getTime() + slotStepMinutes * 60000 <= endOfDay.getTime()) {
    const currentSlotEnd = new Date(currentSlotStart.getTime() + slotStepMinutes * 60000);
    const slotLabel = formatTimeSlotLabel(currentSlotStart, currentSlotEnd);

    let isPast = false;
    if (isToday && currentSlotStart.getTime() <= now.getTime()) {
      isPast = true;
    }

    const overlapCount = existingBookings.filter((b) => {
      const bStart = new Date(b.scheduled_at);
      const bEnd = new Date(b.occupied_until || (bStart.getTime() + slotStepMinutes * 60000));
      return (bStart < currentSlotEnd) && (bEnd > currentSlotStart);
    }).length;

    const isAvailable = !isPast && (overlapCount < capacity) && Boolean(listing.is_available);

    slots.push({
      slot: slotLabel,
      startTime: currentSlotStart.toISOString(),
      endTime: currentSlotEnd.toISOString(),
      isAvailable,
      reason: isPast ? 'PAST_TIME' : (overlapCount >= capacity ? 'ALREADY_BOOKED' : 'AVAILABLE'),
    });

    currentSlotStart = new Date(currentSlotStart.getTime() + slotStepMinutes * 60000);
  }

  return {
    date: targetDateStr,
    durationMinutes: durationConfig.durationMinutes,
    bufferMinutes: durationConfig.bufferMinutes,
    totalOccupancyMinutes: durationConfig.totalOccupancyMinutes,
    capacity,
    isListingAvailable: listing.is_available,
    slots,
  };
};

function formatTimeSlotLabel(startDate, endDate) {
  const formatClock = (d) => {
    let hours = d.getHours();
    const minutes = d.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const mStr = minutes < 10 ? '0' + minutes : minutes;
    const hStr = hours < 10 ? '0' + hours : hours;
    return hStr + ':' + mStr + ' ' + ampm;
  };
  return formatClock(startDate) + ' - ' + formatClock(endDate);
}
