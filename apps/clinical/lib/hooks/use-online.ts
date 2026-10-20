"use client";
import { useNetwork } from "../network";

/** True while the browser reports a network connection. Assumes online on the server. */
export const useOnline = () => useNetwork().online;
