"use client";
import { useEffect, useRef } from "react";
import { useNetwork } from "@mhai/api-client/network";
import { useToast } from "../ui/toast";

/** Data-saver styling on <html>, and "back online" after an offline spell. */
export function NetworkEffects() {
  const { online, saveData, slow } = useNetwork();
  const { show } = useToast();
  const wasOffline = useRef(false);
  useEffect(() => {
    const root = document.documentElement;
    if (saveData || slow) root.dataset.saveData = "true";
    else delete root.dataset.saveData;
  }, [saveData, slow]);
  useEffect(() => {
    if (!online) wasOffline.current = true;
    else if (wasOffline.current) {
      wasOffline.current = false;
      show({ title: "You're back online", tone: "ok", ms: 2400 });
    }
  }, [online, show]);
  return null;
}
