import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
gsap.registerPlugin(ScrollTrigger);
/** Single synchronized progress source (0..1) for the pinned scene. Reverses naturally with scroll. */
export function bindProgress(el: HTMLElement, ref: { current: number }, onUpdate: (p: number) => void) {
  const st = ScrollTrigger.create({ trigger: el, start: "top top", end: "bottom bottom", scrub: true,
    onUpdate: (s) => { ref.current = s.progress; onUpdate(s.progress); } });
  return () => st.kill();
}
