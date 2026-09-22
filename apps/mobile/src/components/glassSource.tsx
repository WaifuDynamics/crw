import React, { createContext, useContext } from 'react';

// Kept as a passthrough for API compatibility.
//
// This used to wrap the whole app in a native view that the Android liquid-glass shader
// refracted. Android no longer has liquid glass (it crashed on some devices) - it uses
// glassmorphism painted inline instead - so there is nothing to sample and nothing native
// to wrap the app in. iOS draws its own Liquid Glass per surface and never needed this.

const Context = createContext<number | null>(null);

/** Always null now: nothing is sampled. */
export const useGlassSource = () => useContext(Context);

export function GlassSourceProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
