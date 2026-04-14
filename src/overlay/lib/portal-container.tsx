import React, { createContext, useContext } from "react";

const PortalContainerContext = createContext<HTMLElement | null>(null);

export function PortalContainerProvider({ container, children }: { container: HTMLElement; children: React.ReactNode }) {
  return (
    <PortalContainerContext.Provider value={container}>
      {children}
    </PortalContainerContext.Provider>
  );
}

export function usePortalContainer(): HTMLElement | undefined {
  const container = useContext(PortalContainerContext);
  return container || undefined;
}
