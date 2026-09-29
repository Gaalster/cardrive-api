// Explicitly disable for real recognition and payment. No automatic fallback.
export const DEMO_MODE = process.env.EXPO_PUBLIC_DEMO_MODE !== "false";
