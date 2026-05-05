export const MESSAGE_RATE_LIMITS = {
  create: {
    capacity: 10,
    refillAmount: 5,
    refillIntervalMs: 1000,
  },
  delete: {
    capacity: 20,
    refillAmount: 20,
    refillIntervalMs: 60_000,
  },
  edit: {
    capacity: 10,
    refillAmount: 10,
    refillIntervalMs: 60_000,
  },
  history: {
    capacity: 60,
    refillAmount: 60,
    refillIntervalMs: 60_000,
  },
} as const;
