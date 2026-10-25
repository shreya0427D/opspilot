"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False in server-rendered HTML, true once React is running in the browser. Submit buttons stay
 * disabled until then so a fast click can't trigger a native GET that puts form fields
 * (including passwords) in the URL.
 */
export function useHydrated() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
