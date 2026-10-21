"use client";
import { useNetwork } from "@mhai/api-client/network";

/** True while the browser reports a network connection. Assumes online on the server. */
export const useOnline = () => useNetwork().online;
