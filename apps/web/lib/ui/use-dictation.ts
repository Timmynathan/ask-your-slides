"use client";

// Speak instead of type: the browser's own speech recognition (Web Speech API), no extra provider
// or cost. Supported in Chrome, Edge and Safari; elsewhere `supported` is false and the mic is
// hidden. Words appear in the box as they are spoken (interim results); the student reviews, then
// sends. Note: Chrome and Edge send the audio to their own speech service to transcribe it.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noop = () => () => {};

export function useDictation(onText: (text: string) => void, lang = "en-NG") {
  // Known only in the browser: false on the server and on first paint, so markup matches.
  const supported = useSyncExternalStore(noop, () => ctor() !== null, () => false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const write = useRef(onText);
  useEffect(() => {
    write.current = onText;
  });

  const stop = useCallback(() => rec.current?.stop(), []);

  /** Start listening; `base` is what's already in the box (dictation is appended to it). */
  const start = useCallback(
    (base: string) => {
      const Ctor = ctor();
      if (!Ctor || rec.current) return;
      const r = new Ctor();
      r.lang = lang;
      r.continuous = true;
      r.interimResults = true;
      const prefix = base.trim() ? `${base.trimEnd()} ` : "";
      r.onresult = (e) => {
        let said = "";
        for (let i = 0; i < e.results.length; i++) said += e.results[i][0].transcript;
        write.current(prefix + said.trimStart());
      };
      r.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") setError("Microphone blocked. Allow it in your browser's site settings.");
        else if (e.error === "audio-capture") setError("No microphone found.");
        else if (e.error === "network") setError("Voice typing needs an internet connection.");
        // "no-speech" and "aborted" just end the session quietly.
      };
      r.onend = () => {
        rec.current = null;
        setListening(false);
      };
      rec.current = r;
      setError(null);
      setListening(true);
      try {
        r.start();
      } catch {
        rec.current = null;
        setListening(false);
      }
    },
    [lang],
  );

  // Never leave the microphone on after the component goes away.
  useEffect(() => () => rec.current?.abort(), []);

  return { supported, listening, error, start, stop };
}
